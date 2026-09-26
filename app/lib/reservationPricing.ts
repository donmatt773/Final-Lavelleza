import mongoose from 'mongoose';
import Room from '@/app/lib/Room';
import Promo from '@/app/lib/Promo';
import RateSettings from '@/app/lib/RateSettings';
import AddOn from '@/app/lib/AddOn';
import { AddOnAvailabilityError, getAddOnAvailability } from '@/app/lib/addOnAvailability';

const DEFAULT_EXTRA_PERSON_RATE = 150;
const STOCK_HOLDING_RESERVATION_STATUSES = new Set(['PENDING', 'CONFIRMED', 'CHECKED_IN']);

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
  roomBreakdown: Array<{
    roomId: string;
    roomName: string;
    adults: number;
    children: number;
    roomRate: number;
    packageRoom: boolean;
    additionalRoomDiscount: number;
    extraPersonFee: number;
    extraBedFee: number;
  }>;
  subtotal: number;
  grandTotal: number;
};

type PricingInput = {
  roomId?: string;
  roomAssignments?: Array<{ roomId: string; adults: number; children: number; checkIn?: Date; checkOut?: Date }>;
  promoId?: string | null;
  checkIn: Date;
  checkOut: Date;
  adults: number;
  children: number;
  reservationStatus?: string;
  excludeReservationId?: string;
  addOns?: Array<{ addOnId: string; quantity: number }>;
};

type PricingPromo = {
  status?: string;
  startDate?: Date;
  endDate?: Date;
  packagePrice?: number;
  includedPax?: number;
  includedRoomIds?: Array<string | mongoose.Types.ObjectId>;
  additionalRoomDiscount?: {
    mode: 'PERCENT' | 'FIXED_AMOUNT';
    value: number;
    appliesToRoomIds?: Array<string | mongoose.Types.ObjectId>;
    maxDiscountAmount?: number;
  } | null;
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
  const assignments = input.roomAssignments?.length
    ? input.roomAssignments
    : input.roomId
      ? [{ roomId: input.roomId, adults: input.adults, children: input.children }]
      : [];
  const roomIds = assignments.map((assignment) => assignment.roomId);
  if (assignments.length === 0 || new Set(roomIds).size !== roomIds.length) {
    throw new Error('Select one or more unique rooms for pricing.');
  }

  const roomDocs = await Room.find({ _id: { $in: roomIds }, isArchived: false })
    .select('name nightlyRate maxGuests')
    .lean();
  const roomsById = new Map(roomDocs.map((room) => [String(room._id), room]));
  if (roomsById.size !== roomIds.length) {
    throw new Error('One or more selected rooms could not be found.');
  }

  const rateSettings = await RateSettings.findOne({ key: 'default' })
    .select('extraPersonRate')
    .lean();

  const extraPersonRate = Number(rateSettings?.extraPersonRate ?? DEFAULT_EXTRA_PERSON_RATE);

  const nights = getNumberOfNights(input.checkIn, input.checkOut);
  const roomDetails = assignments.map((assignment) => {
    const room = roomsById.get(assignment.roomId)!;
    return {
      roomId: assignment.roomId,
      roomName: String(room.name || 'Room'),
      adults: Math.floor(assignment.adults),
      children: Math.floor(assignment.children),
      nightlyRate: Number(room.nightlyRate || 0),
      maxGuests: Math.max(1, Number(room.maxGuests || 1)),
      nights: getNumberOfNights(assignment.checkIn || input.checkIn, assignment.checkOut || input.checkOut),
    };
  });
  const roomRate = normalizeMoney(roomDetails.reduce((total, room) => total + room.nightlyRate * room.nights, 0));

  const requestedAddOns = Array.isArray(input.addOns) ? input.addOns : [];
  const requestedAddOnQuantities = new Map<string, number>();
  requestedAddOns.forEach((item) => {
    const addOnId = String(item.addOnId);
    const quantity = Number(item.quantity);
    if (!mongoose.Types.ObjectId.isValid(addOnId) || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error('One or more selected add-ons are invalid.');
    }
    requestedAddOnQuantities.set(addOnId, (requestedAddOnQuantities.get(addOnId) || 0) + quantity);
  });
  const addOnIds = Array.from(requestedAddOnQuantities.keys());
  const addOnDocs = addOnIds.length > 0
    ? await AddOn.find({ _id: { $in: addOnIds }, isActive: true }).lean()
    : [];
  if (addOnDocs.length !== addOnIds.length) {
    throw new Error('One or more selected add-ons are invalid or inactive.');
  }

  const holdsAddOnStock = STOCK_HOLDING_RESERVATION_STATUSES.has(String(input.reservationStatus || 'PENDING').toUpperCase());
  const availableAddOnQuantities = await getAddOnAvailability({
    addOns: addOnDocs,
    checkIn: holdsAddOnStock ? input.checkIn : undefined,
    checkOut: holdsAddOnStock ? input.checkOut : undefined,
    excludeReservationId: input.excludeReservationId,
  });
  const addOnById = new Map(addOnDocs.map((addOn) => [String(addOn._id), addOn]));
  const addOns = Array.from(requestedAddOnQuantities, ([addOnId, quantity]) => {
    const addOn = addOnById.get(addOnId);
    if (!addOn) {
      throw new Error('One or more selected add-ons are invalid or inactive.');
    }
    const availableQuantity = availableAddOnQuantities.get(addOnId);
    if (holdsAddOnStock && availableQuantity !== null && availableQuantity !== undefined && quantity > availableQuantity) {
      throw new AddOnAvailabilityError(`Only ${availableQuantity} ${addOn.name} available for the selected stay dates.`);
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
  let packageRoomId: string | null = null;
  let promoDoc: PricingPromo | null = null;

  if (input.promoId && mongoose.Types.ObjectId.isValid(input.promoId)) {
    promoDoc = await Promo.findOne({ _id: input.promoId, isArchived: false })
      .select('status startDate endDate packagePrice includedPax includedRoomIds additionalRoomDiscount')
      .lean();

    if (promoDoc && promoDoc.status === 'ACTIVE') {
      const isWithinDateRange = (!promoDoc.startDate || toUtcDay(input.checkIn) >= toUtcDay(promoDoc.startDate))
        && (!promoDoc.endDate || toUtcDay(input.checkOut) <= toUtcDay(promoDoc.endDate));

      if (isWithinDateRange) {
        packageRoomId = roomDetails.find((room) => isPromoApplicableToRoom(promoDoc!, room.roomId).includedMatch)?.roomId || null;
        const packageRoomNights = roomDetails.find((room) => room.roomId === packageRoomId)?.nights || nights;
        if (packageRoomId) promoPackagePrice = normalizeMoney(Number(promoDoc.packagePrice || 0) * packageRoomNights);
      }
    }
  }

  let extraPersonFee = 0;
  let extraBedFee = 0;
  let additionalRoomCharge = 0;
  const roomBreakdown = roomDetails.map((room) => {
    const packageRoom = room.roomId === packageRoomId && promoPackagePrice > 0;
    const includedGuests = packageRoom ? Number(promoDoc?.includedPax || 0) : 0;
    const roomCapacity = Math.max(room.maxGuests, includedGuests);
    const overflowGuests = Math.max(0, room.adults + room.children - roomCapacity);
    const roomExtraPersonFee = normalizeMoney(overflowGuests * extraPersonRate * room.nights);
    const roomExtraBedFee = 0;
    const roomNightlyTotal = normalizeMoney(room.nightlyRate * room.nights);
    let roomDiscount = 0;

    if (!packageRoom) {
      additionalRoomCharge += roomNightlyTotal;
      const applicability = promoDoc ? isPromoApplicableToRoom(promoDoc, room.roomId) : null;
      if (packageRoomId && promoDoc?.additionalRoomDiscount && applicability?.additionalMatch) {
        const discount = promoDoc.additionalRoomDiscount.mode === 'PERCENT'
          ? roomNightlyTotal * (Number(promoDoc.additionalRoomDiscount.value || 0) / 100)
          : Number(promoDoc.additionalRoomDiscount.value || 0);
        const discountCap = Number(promoDoc.additionalRoomDiscount.maxDiscountAmount || 0);
        roomDiscount = Math.min(normalizeMoney(discount), roomNightlyTotal);
        if (discountCap > 0) roomDiscount = Math.min(roomDiscount, Math.max(0, discountCap - additionalRoomDiscount));
        additionalRoomDiscount += roomDiscount;
      }
    }

    extraPersonFee += roomExtraPersonFee;
    extraBedFee += roomExtraBedFee;
    return {
      roomId: room.roomId,
      roomName: room.roomName,
      adults: room.adults,
      children: room.children,
      roomRate: roomNightlyTotal,
      packageRoom,
      additionalRoomDiscount: roomDiscount,
      extraPersonFee: roomExtraPersonFee,
      extraBedFee: roomExtraBedFee,
    };
  });
  extraPersonFee = normalizeMoney(extraPersonFee);
  extraBedFee = normalizeMoney(extraBedFee);
  additionalRoomDiscount = normalizeMoney(additionalRoomDiscount);
  promoDiscount = 0;

  const baseRoomCharge = promoPackagePrice + additionalRoomCharge;
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
    roomBreakdown,
    subtotal,
    grandTotal,
  };
}
