import mongoose from 'mongoose';
import Promo from '@/app/lib/Promo';

export type PromoStatusCategory = 'VALID' | 'EXPIRED' | 'INACTIVE';

export type PromoInclusionSummary = {
  _id?: string;
  type?: string;
  name?: string;
  description?: string;
  quantity?: number;
};

export type PromoEligibilityItem = {
  _id: string;
  name: string;
  code: string;
  status: string;
  statusCategory: PromoStatusCategory;
  roomEligible: boolean;
  dateEligible: boolean;
  eligible: boolean;
  ineligibilityReasons: string[];
  inclusions: PromoInclusionSummary[];
};

type EligibilityInput = {
  roomId: string;
  checkIn: Date;
  checkOut: Date;
};

function toDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizePromoInclusions(inclusions: unknown): PromoInclusionSummary[] {
  if (!Array.isArray(inclusions)) return [];
  return inclusions.map((item) => {
    if (!item || typeof item !== 'object') return {};
    const inclusion = item as Record<string, unknown>;
    return {
      _id: inclusion._id ? String(inclusion._id) : undefined,
      type: typeof inclusion.type === 'string' ? inclusion.type : undefined,
      name: typeof inclusion.name === 'string' ? inclusion.name : undefined,
      description: typeof inclusion.description === 'string' ? inclusion.description : undefined,
      quantity: typeof inclusion.quantity === 'number' ? inclusion.quantity : undefined,
    };
  });
}

function isPromoExpired(status: string, endDate: Date | null, now: Date) {
  if (status === 'EXPIRED') return true;
  if (endDate && endDate < now) return true;
  return false;
}

function isRoomEligible(includedRoomIds: unknown, roomId: string) {
  if (!Array.isArray(includedRoomIds) || includedRoomIds.length === 0) return true;
  const normalized = includedRoomIds.map((id) => String(id));
  return normalized.includes(roomId);
}

function isDateEligible(startDate: Date | null, endDate: Date | null, checkIn: Date, checkOut: Date) {
  if (startDate && checkIn < startDate) return false;
  if (endDate && checkOut > endDate) return false;
  return true;
}

export async function evaluatePromosForReservation(input: EligibilityInput) {
  const promos = await Promo.find({ isArchived: false })
    .select('name code status startDate endDate includedRoomIds inclusions')
    .sort({ name: 1 })
    .lean();

  const now = new Date();

  const items: PromoEligibilityItem[] = promos.map((promo) => {
    const promoStatus = String(promo.status || '').toUpperCase();
    const startDate = toDate(promo.startDate);
    const endDate = toDate(promo.endDate);

    const expired = isPromoExpired(promoStatus, endDate, now);
    const inactive = !expired && promoStatus !== 'ACTIVE';

    const roomEligible = isRoomEligible(promo.includedRoomIds, input.roomId);
    const dateEligible = isDateEligible(startDate, endDate, input.checkIn, input.checkOut);

    const statusCategory: PromoStatusCategory = expired ? 'EXPIRED' : inactive ? 'INACTIVE' : 'VALID';

    const ineligibilityReasons: string[] = [];
    if (statusCategory === 'EXPIRED') ineligibilityReasons.push('Promo is expired.');
    if (statusCategory === 'INACTIVE') ineligibilityReasons.push('Promo is inactive.');
    if (!roomEligible) ineligibilityReasons.push('Promo is not eligible for the selected room.');
    if (!dateEligible) ineligibilityReasons.push('Promo is not eligible for the selected dates.');

    const eligible = statusCategory === 'VALID' && roomEligible && dateEligible;

    return {
      _id: String(promo._id),
      name: String(promo.name || ''),
      code: String(promo.code || ''),
      status: promoStatus,
      statusCategory,
      roomEligible,
      dateEligible,
      eligible,
      ineligibilityReasons,
      inclusions: normalizePromoInclusions(promo.inclusions),
    };
  });

  const validPromos = items.filter((item) => item.statusCategory === 'VALID');
  const expiredPromos = items.filter((item) => item.statusCategory === 'EXPIRED');
  const inactivePromos = items.filter((item) => item.statusCategory === 'INACTIVE');
  const eligiblePromos = items.filter((item) => item.eligible);

  return {
    items,
    validPromos,
    expiredPromos,
    inactivePromos,
    eligiblePromos,
  };
}

export async function validateSelectedPromoEligibility({
  promoId,
  roomId,
  checkIn,
  checkOut,
}: {
  promoId: string;
  roomId: string;
  checkIn: Date;
  checkOut: Date;
}) {
  if (!mongoose.Types.ObjectId.isValid(promoId)) {
    return {
      valid: false,
      message: 'Selected promo ID is invalid.',
      promo: null as PromoEligibilityItem | null,
    };
  }

  const catalog = await evaluatePromosForReservation({ roomId, checkIn, checkOut });
  const selected = catalog.items.find((item) => item._id === promoId) || null;

  if (!selected) {
    return {
      valid: false,
      message: 'Selected promo does not exist.',
      promo: null,
    };
  }

  if (!selected.eligible) {
    return {
      valid: false,
      message: selected.ineligibilityReasons[0] || 'Selected promo is not eligible for this reservation.',
      promo: selected,
    };
  }

  return {
    valid: true,
    message: '',
    promo: selected,
  };
}
