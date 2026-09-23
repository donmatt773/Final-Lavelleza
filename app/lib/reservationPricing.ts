import mongoose from 'mongoose';
import Room from '@/app/lib/Room';
import Promo from '@/app/lib/Promo';
import RateSettings from '@/app/lib/RateSettings';
import AddOn from '@/app/lib/AddOn';

const DEFAULT_RATE_SETTINGS = {
  extraPersonRate: 150,
  extraSingleBedRate: 300,
  extraDoubleBedRate: 500,
};

export type ReservationPricingSummary = {
  currency: 'PHP';
  roomRate: number;
  numberOfNights: number;
  extraPersonFee: number;
  extraBedFee: number;
  addOnTotal: number;
  addOns: Array<{
    addOnId: string;
    quantity: number;
    name: string;
    description?: string;
    category?: string;
    unitPrice: number;
    totalPrice: number;
  }>;
  promoPackagePrice: number;
  promoDiscount: number;
  additionalRoomDiscount: number;
  subtotal: number;
  grandTotal: number;
};

type PricingInput = {
  roomId: string;
  promoId?: string | null;
  checkIn: Date;
  checkOut: Date;
  adults: number;
  children: number;
  addOns?: Array<{ addOnId: string; quantity: number }>;
};

function toStartOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getNumberOfNights(checkIn: Date, checkOut: Date) {
  const start = toStartOfLocalDay(checkIn).getTime();
  const end = toStartOfLocalDay(checkOut).getTime();
  const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

function normalizeMoney(value: number) {
  return Math.max(0, Math.round(value * 100) / 100);
}

function toUtcDay(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function isPromoApplicableToRoom(promo: {
  includedRoomIds?: Array<string | mongoose.Types.ObjectId>;
  additionalRoomDiscount?: {
    appliesToRoomIds?: Array<string | mongoose.Types.ObjectId>;
  } | null;
}, roomId: string) {
  const includedRoomIds = Array.isArray(promo.includedRoomIds)
    ? promo.includedRoomIds.map((id) => String(id))
    : [];
  const appliesToRoomIds = Array.isArray(promo.additionalRoomDiscount?.appliesToRoomIds)
    ? promo.additionalRoomDiscount?.appliesToRoomIds?.map((id) => String(id))
    : [];

  const includedMatch = includedRoomIds.length === 0 || includedRoomIds.includes(roomId);
  const additionalMatch = appliesToRoomIds.length === 0 || appliesToRoomIds.includes(roomId);

  return { includedMatch, additionalMatch };
}

export async function calculateReservationPricing(input: PricingInput): Promise<ReservationPricingSummary> {
  const roomDoc = await Room.findOne({ _id: input.roomId, isArchived: false }).select('nightlyRate maxGuests').lean();
  if (!roomDoc) {
    throw new Error('Room not found for pricing computation.');
  }

  const rateSettings = await RateSettings.findOne({ key: 'default' })
    .select('extraPersonRate extraSingleBedRate extraDoubleBedRate')
    .lean();

  const extraPersonRate = Number(rateSettings?.extraPersonRate ?? DEFAULT_RATE_SETTINGS.extraPersonRate);
  const extraSingleBedRate = Number(rateSettings?.extraSingleBedRate ?? DEFAULT_RATE_SETTINGS.extraSingleBedRate);
  const extraDoubleBedRate = Number(rateSettings?.extraDoubleBedRate ?? DEFAULT_RATE_SETTINGS.extraDoubleBedRate);

  const nights = getNumberOfNights(input.checkIn, input.checkOut);
  const roomRate = normalizeMoney(Number(roomDoc.nightlyRate || 0) * nights);

  const totalGuests = Math.max(0, Math.floor(input.adults) + Math.floor(input.children));
  const roomCapacity = Math.max(1, Number(roomDoc.maxGuests || 1));
  const overflowGuests = Math.max(0, totalGuests - roomCapacity);

  let extraPersonFee = normalizeMoney(overflowGuests * extraPersonRate * nights);

  const doubleBeds = Math.floor(overflowGuests / 2);
  const singleBeds = overflowGuests % 2;
  let extraBedFee = normalizeMoney((doubleBeds * extraDoubleBedRate + singleBeds * extraSingleBedRate) * nights);

  const requestedAddOns = Array.isArray(input.addOns) ? input.addOns : [];
  const addOnIds = requestedAddOns.map((item) => String(item.addOnId));
  const addOnDocs = addOnIds.length > 0
    ? await AddOn.find({ _id: { $in: addOnIds }, isActive: true }).lean()
    : [];
  const addOnById = new Map(addOnDocs.map((addOn) => [String(addOn._id), addOn]));
  const addOns = requestedAddOns.map((item) => {
    const addOn = addOnById.get(String(item.addOnId));
    const quantity = Math.floor(Number(item.quantity));
    if (!addOn || !Number.isFinite(quantity) || quantity < 1) {
      throw new Error('One or more selected add-ons are invalid or inactive.');
    }
    if (addOn.stockQuantity !== null && addOn.stockQuantity !== undefined && quantity > addOn.stockQuantity) {
      throw new Error(`Insufficient stock for add-on: ${addOn.name}.`);
    }
    const unitPrice = normalizeMoney(Number(addOn.price || 0));
    return {
      addOnId: String(addOn._id),
      quantity,
      name: String(addOn.name || ''),
      description: addOn.description || undefined,
      category: addOn.category || undefined,
      unitPrice,
      totalPrice: normalizeMoney(unitPrice * quantity),
    };
  });
  const addOnTotal = normalizeMoney(addOns.reduce((total, addOn) => total + addOn.totalPrice, 0));

  let promoDiscount = 0;
  let promoPackagePrice = 0;
  let additionalRoomDiscount = 0;

  if (input.promoId && mongoose.Types.ObjectId.isValid(input.promoId)) {
    const promoDoc = await Promo.findOne({ _id: input.promoId, isArchived: false })
      .select('status startDate endDate packagePrice includedRoomIds additionalRoomDiscount')
      .lean();

    if (promoDoc && promoDoc.status === 'ACTIVE') {
      const isWithinDateRange = (!promoDoc.startDate || toUtcDay(input.checkIn) >= toUtcDay(promoDoc.startDate))
        && (!promoDoc.endDate || toUtcDay(input.checkOut) <= toUtcDay(promoDoc.endDate));

      if (isWithinDateRange) {
        const applicability = isPromoApplicableToRoom(promoDoc, input.roomId);
        if (applicability.includedMatch) {
          promoPackagePrice = normalizeMoney(Number(promoDoc.packagePrice || 0) * nights);
        }

        if (promoDoc.additionalRoomDiscount && applicability.additionalMatch) {
          const discountBase = Math.max(promoPackagePrice || roomRate, 0);
          if (promoDoc.additionalRoomDiscount.mode === 'PERCENT') {
            additionalRoomDiscount = normalizeMoney(discountBase * (Number(promoDoc.additionalRoomDiscount.value || 0) / 100));
          } else {
            additionalRoomDiscount = normalizeMoney(Number(promoDoc.additionalRoomDiscount.value || 0));
          }

          const maxDiscountAmount = Number(promoDoc.additionalRoomDiscount.maxDiscountAmount || 0);
          if (maxDiscountAmount > 0) {
            additionalRoomDiscount = Math.min(additionalRoomDiscount, normalizeMoney(maxDiscountAmount));
          }

          additionalRoomDiscount = Math.min(additionalRoomDiscount, discountBase);
        }
      }
    }
  }

  if (promoPackagePrice > 0) {
    // A package price already covers the room and included guest capacity.
    extraPersonFee = 0;
    extraBedFee = 0;
    promoDiscount = 0;
    additionalRoomDiscount = 0;
  }

  const baseRoomCharge = promoPackagePrice || roomRate;
  const subtotal = normalizeMoney(baseRoomCharge + extraPersonFee + extraBedFee + addOnTotal);
  const grandTotal = normalizeMoney(Math.max(subtotal - additionalRoomDiscount, 0));

  return {
    currency: 'PHP',
    roomRate,
    numberOfNights: nights,
    extraPersonFee,
    extraBedFee,
    addOnTotal,
    addOns,
    promoPackagePrice,
    promoDiscount,
    additionalRoomDiscount,
    subtotal,
    grandTotal,
  };
}
