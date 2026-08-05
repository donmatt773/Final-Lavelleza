import mongoose from 'mongoose';
import Room from '@/app/lib/Room';
import Promo from '@/app/lib/Promo';
import RateSettings from '@/app/lib/RateSettings';

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

  const extraPersonFee = normalizeMoney(overflowGuests * extraPersonRate * nights);

  const doubleBeds = Math.floor(overflowGuests / 2);
  const singleBeds = overflowGuests % 2;
  const extraBedFee = normalizeMoney((doubleBeds * extraDoubleBedRate + singleBeds * extraSingleBedRate) * nights);

  let promoDiscount = 0;
  let additionalRoomDiscount = 0;

  if (input.promoId && mongoose.Types.ObjectId.isValid(input.promoId)) {
    const promoDoc = await Promo.findOne({ _id: input.promoId, isArchived: false })
      .select('status startDate endDate packagePrice includedRoomIds additionalRoomDiscount')
      .lean();

    if (promoDoc && promoDoc.status === 'ACTIVE') {
      const isWithinDateRange = (!promoDoc.startDate || promoDoc.startDate <= input.checkIn)
        && (!promoDoc.endDate || promoDoc.endDate >= input.checkOut);

      if (isWithinDateRange) {
        const applicability = isPromoApplicableToRoom(promoDoc, input.roomId);
        if (applicability.includedMatch) {
          promoDiscount = normalizeMoney(Math.min(roomRate, Number(promoDoc.packagePrice || 0)));
        }

        if (promoDoc.additionalRoomDiscount && applicability.additionalMatch) {
          const discountBase = Math.max(roomRate - promoDiscount, 0);
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

  const subtotal = normalizeMoney(roomRate + extraPersonFee + extraBedFee);
  const grandTotal = normalizeMoney(Math.max(subtotal - promoDiscount - additionalRoomDiscount, 0));

  return {
    currency: 'PHP',
    roomRate,
    numberOfNights: nights,
    extraPersonFee,
    extraBedFee,
    promoDiscount,
    additionalRoomDiscount,
    subtotal,
    grandTotal,
  };
}
