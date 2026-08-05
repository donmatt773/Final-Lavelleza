import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/app/lib/db';
import Promo, { getPromoEffectiveStatus } from '@/app/lib/Promo';
import Room from '@/app/lib/Room';
import { requireOwner } from '@/app/lib/auth';

const VALID_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'EXPIRED'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidObjectId(value: unknown): value is string {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);
}

function parseDate(value: unknown, field: string, errors: string[]) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    errors.push(`${field} must be a valid date.`);
    return undefined;
  }
  return date;
}

function sanitizeImage(value: unknown, errors: string[]) {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) {
    errors.push('Image/banner must be an object.');
    return undefined;
  }

  const image = value;
  if (typeof image.fileUrl !== 'string' || !image.fileUrl.trim()) {
    errors.push('Image fileUrl is required when image is provided.');
    return undefined;
  }

  const normalized: Record<string, unknown> = {
    fileUrl: image.fileUrl.trim(),
  };

  if (typeof image.storageKey === 'string') normalized.storageKey = image.storageKey.trim();
  if (typeof image.altText === 'string') normalized.altText = image.altText.trim();
  if (typeof image.mimeType === 'string') normalized.mimeType = image.mimeType.trim();
  if (typeof image.width === 'number' && Number.isFinite(image.width) && image.width > 0) normalized.width = image.width;
  if (typeof image.height === 'number' && Number.isFinite(image.height) && image.height > 0) normalized.height = image.height;

  return normalized;
}

function sanitizeInclusions(value: unknown, errors: string[]) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    errors.push('Inclusions must be an array.');
    return undefined;
  }

  const normalized: Array<Record<string, unknown>> = [];

  value.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      errors.push(`Inclusion at index ${index} must be an object.`);
      return;
    }

    const item = entry as Record<string, unknown>;
    if (typeof item.type !== 'string' || !item.type.trim()) {
      errors.push(`Inclusion at index ${index} must have a valid type.`);
      return;
    }

    if (typeof item.name !== 'string' || !item.name.trim()) {
      errors.push(`Inclusion at index ${index} must have a valid name.`);
      return;
    }

    const inclusion: Record<string, unknown> = {
      type: item.type.trim().toUpperCase(),
      name: item.name.trim(),
    };

    if (typeof item.description === 'string') inclusion.description = item.description.trim();
    if (typeof item.unit === 'string') inclusion.unit = item.unit.trim();
    if (typeof item.sortOrder === 'number' && Number.isFinite(item.sortOrder)) inclusion.sortOrder = item.sortOrder;
    if (typeof item.isOptional === 'boolean') inclusion.isOptional = item.isOptional;
    if (item.metadata && typeof item.metadata === 'object') inclusion.metadata = item.metadata;

    if (item.quantity !== undefined) {
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity < 1) {
        errors.push(`Inclusion quantity at index ${index} must be a number greater than or equal to 1.`);
      } else {
        inclusion.quantity = quantity;
      }
    }

    if (item.pax !== undefined) {
      const pax = Number(item.pax);
      if (!Number.isFinite(pax) || pax < 1) {
        errors.push(`Inclusion pax at index ${index} must be a number greater than or equal to 1.`);
      } else {
        inclusion.pax = pax;
      }
    }

    if (item.roomId !== undefined) {
      if (!isValidObjectId(item.roomId)) {
        errors.push(`Inclusion roomId at index ${index} must be a valid room ID.`);
      } else {
        inclusion.roomId = item.roomId;
      }
    }

    if (inclusion.type === 'ROOM' && !inclusion.roomId) {
      errors.push(`Inclusion at index ${index} with type ROOM requires roomId.`);
    }

    normalized.push(inclusion);
  });

  return normalized;
}

function sanitizeRoomIds(value: unknown, fieldName: string, errors: string[]) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    errors.push(`${fieldName} must be an array of room IDs.`);
    return undefined;
  }

  const normalized = value
    .filter((id) => id !== null && id !== undefined && id !== '')
    .map((id) => String(id));

  const invalid = normalized.filter((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalid.length > 0) {
    errors.push(`${fieldName} contains invalid room IDs.`);
    return undefined;
  }

  return Array.from(new Set(normalized));
}

function sanitizeAdditionalRoomDiscount(value: unknown, errors: string[]) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isRecord(value)) {
    errors.push('additionalRoomDiscount must be an object.');
    return undefined;
  }

  const discount = value;
  if (discount.mode !== 'PERCENT' && discount.mode !== 'FIXED_AMOUNT') {
    errors.push('additionalRoomDiscount.mode must be PERCENT or FIXED_AMOUNT.');
    return undefined;
  }

  const amount = Number(discount.value);
  if (!Number.isFinite(amount) || amount < 0) {
    errors.push('additionalRoomDiscount.value must be a non-negative number.');
    return undefined;
  }

  const normalized: Record<string, unknown> = {
    mode: discount.mode,
    value: amount,
  };

  const appliesToRoomIds = sanitizeRoomIds(discount.appliesToRoomIds, 'additionalRoomDiscount.appliesToRoomIds', errors);
  if (appliesToRoomIds !== undefined) normalized.appliesToRoomIds = appliesToRoomIds;

  if (discount.maxDiscountAmount !== undefined) {
    const maxDiscount = Number(discount.maxDiscountAmount);
    if (!Number.isFinite(maxDiscount) || maxDiscount < 0) {
      errors.push('additionalRoomDiscount.maxDiscountAmount must be a non-negative number.');
    } else {
      normalized.maxDiscountAmount = maxDiscount;
    }
  }

  if (typeof discount.notes === 'string') normalized.notes = discount.notes.trim();

  return normalized;
}

function collectReferencedRoomIds(payload: Record<string, unknown>) {
  const ids = new Set<string>();

  const includedRoomIds = Array.isArray(payload.includedRoomIds) ? payload.includedRoomIds : [];
  includedRoomIds.forEach((id) => ids.add(String(id)));

  const inclusions = Array.isArray(payload.inclusions) ? payload.inclusions : [];
  inclusions.forEach((inclusion) => {
    if (isRecord(inclusion) && typeof inclusion.roomId === 'string' && inclusion.roomId) {
      ids.add(inclusion.roomId);
    }
  });

  const discountRooms = isRecord(payload.additionalRoomDiscount)
    ? (Array.isArray(payload.additionalRoomDiscount.appliesToRoomIds) ? payload.additionalRoomDiscount.appliesToRoomIds : [])
    : [];
  if (Array.isArray(discountRooms)) {
    discountRooms.forEach((id) => ids.add(String(id)));
  }

  return Array.from(ids).filter(Boolean);
}

type RoomReferenceDoc = {
  _id: string | mongoose.Types.ObjectId;
  isArchived?: boolean;
};

async function validateRoomReferences(roomIds: string[]) {
  if (!roomIds.length) return [];

  const docs = await Room.find({ _id: { $in: roomIds } }).select('_id isArchived').lean() as RoomReferenceDoc[];
  const existing = new Set(docs.filter((room) => !room.isArchived).map((room) => String(room._id)));
  return roomIds.filter((id) => !existing.has(String(id)));
}

function buildListQuery(
  search?: string | null,
  status?: string | null,
  includeArchived?: boolean,
  startDateFrom?: Date,
  startDateTo?: Date,
  endDateFrom?: Date,
  endDateTo?: Date,
  validOn?: Date,
  validity?: string | null
) {
  const query: Record<string, unknown> = {};

  if (!includeArchived) {
    query.isArchived = false;
  }

  if (search && search.trim()) {
    const value = search.trim();
    query.$or = [
      { name: { $regex: value, $options: 'i' } },
      { code: { $regex: value, $options: 'i' } },
      { description: { $regex: value, $options: 'i' } },
      { notes: { $regex: value, $options: 'i' } },
      { 'inclusions.name': { $regex: value, $options: 'i' } },
    ];
  }

  if (status && VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    query.status = status;
  }

  if (startDateFrom || startDateTo) {
    query.startDate = {
      ...(startDateFrom ? { $gte: startDateFrom } : {}),
      ...(startDateTo ? { $lte: startDateTo } : {}),
    };
  }

  if (endDateFrom || endDateTo) {
    query.endDate = {
      ...(endDateFrom ? { $gte: endDateFrom } : {}),
      ...(endDateTo ? { $lte: endDateTo } : {}),
    };
  }

  if (validOn) {
    query.startDate = { ...(query.startDate as Record<string, unknown> | undefined), $lte: validOn };
    query.endDate = { ...(query.endDate as Record<string, unknown> | undefined), $gte: validOn };
  }

  if (validity === 'CURRENT') {
    query.status = 'ACTIVE';
    query.startDate = { ...(query.startDate as Record<string, unknown> | undefined), $lte: new Date() };
    query.endDate = { ...(query.endDate as Record<string, unknown> | undefined), $gte: new Date() };
  } else if (validity === 'UPCOMING') {
    query.status = 'ACTIVE';
    query.startDate = { ...(query.startDate as Record<string, unknown> | undefined), $gt: new Date() };
  } else if (validity === 'EXPIRED') {
    query.$or = [
      ...(Array.isArray(query.$or) ? query.$or : []),
      { status: 'EXPIRED' },
      { endDate: { $lt: new Date() } },
    ];
  }

  return query;
}

function validateCreatePayload(body: unknown) {
  const errors: string[] = [];
  if (!body || typeof body !== 'object') {
    return { errors: ['Request body must be a JSON object.'], payload: null as Record<string, unknown> | null };
  }

  const input = body as Record<string, unknown>;

  if (typeof input.name !== 'string' || !input.name.trim()) {
    errors.push('Promo name is required.');
  }

  if (typeof input.code !== 'string' || !input.code.trim()) {
    errors.push('Promo code is required.');
  }

  const packagePrice = Number(input.packagePrice);
  if (!Number.isFinite(packagePrice) || packagePrice < 0) {
    errors.push('Package price must be a non-negative number.');
  }

  const status = input.status === undefined ? 'DRAFT' : String(input.status).toUpperCase();
  if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    errors.push('Promo status must be DRAFT, ACTIVE, INACTIVE, or EXPIRED.');
  }

  const startDate = parseDate(input.startDate, 'startDate', errors);
  const endDate = parseDate(input.endDate, 'endDate', errors);
  const normalizedStatus = getPromoEffectiveStatus(status, startDate, endDate);

  if (startDate && endDate && endDate < startDate) {
    errors.push('End date must be greater than or equal to start date.');
  }

  if (status === 'ACTIVE' && (!startDate || !endDate)) {
    errors.push('ACTIVE promos require startDate and endDate.');
  }

  const includedPax = input.includedPax === undefined ? undefined : Number(input.includedPax);
  if (includedPax !== undefined && (!Number.isFinite(includedPax) || includedPax < 1)) {
    errors.push('includedPax must be a number greater than or equal to 1.');
  }

  const banner = sanitizeImage(input.banner, errors);
  const inclusions = sanitizeInclusions(input.inclusions, errors);
  const includedRoomIds = sanitizeRoomIds(input.includedRoomIds, 'includedRoomIds', errors);
  const additionalRoomDiscount = sanitizeAdditionalRoomDiscount(input.additionalRoomDiscount, errors);

  if (input.termsAndConditions !== undefined) {
    if (!Array.isArray(input.termsAndConditions) || input.termsAndConditions.some((term) => typeof term !== 'string')) {
      errors.push('termsAndConditions must be an array of strings.');
    }
  }

  const payload: Record<string, unknown> = {
    name: typeof input.name === 'string' ? input.name.trim() : input.name,
    code: typeof input.code === 'string' ? input.code.trim().toUpperCase() : input.code,
    packagePrice,
    status: normalizedStatus,
    startDate,
    endDate,
    description: typeof input.description === 'string' ? input.description.trim() : undefined,
    notes: typeof input.notes === 'string' ? input.notes.trim() : undefined,
    timezone: typeof input.timezone === 'string' && input.timezone.trim() ? input.timezone.trim() : 'Asia/Manila',
    includedPax,
    currency: typeof input.currency === 'string' && input.currency.trim() ? input.currency.trim().toUpperCase() : 'PHP',
    termsAndConditions: Array.isArray(input.termsAndConditions) ? input.termsAndConditions.map((term) => String(term).trim()) : [],
    isArchived: false,
  };

  if (banner !== undefined) payload.banner = banner;
  if (inclusions !== undefined) payload.inclusions = inclusions;
  if (includedRoomIds !== undefined) payload.includedRoomIds = includedRoomIds;
  if (additionalRoomDiscount !== undefined) payload.additionalRoomDiscount = additionalRoomDiscount;

  return { errors, payload };
}

export async function GET(request: Request) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;

    await connectDB();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status')?.toUpperCase() || null;
    const validity = searchParams.get('validity');
    const includeArchived = searchParams.get('includeArchived') === 'true';

    if (status && !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      return NextResponse.json({ success: false, message: 'Invalid promo status filter.' }, { status: 400 });
    }

    const dateErrors: string[] = [];
    const startDateFrom = parseDate(searchParams.get('startDateFrom'), 'startDateFrom', dateErrors);
    const startDateTo = parseDate(searchParams.get('startDateTo'), 'startDateTo', dateErrors);
    const endDateFrom = parseDate(searchParams.get('endDateFrom'), 'endDateFrom', dateErrors);
    const endDateTo = parseDate(searchParams.get('endDateTo'), 'endDateTo', dateErrors);
    const validOn = parseDate(searchParams.get('validOn'), 'validOn', dateErrors);

    if (dateErrors.length > 0) {
      return NextResponse.json({ success: false, message: 'Invalid date filters.', errors: dateErrors }, { status: 400 });
    }

    const query = buildListQuery(search, status, includeArchived, startDateFrom, startDateTo, endDateFrom, endDateTo, validOn, validity);

    const promos = await Promo.find(query)
      .populate('includedRoomIds', 'name code status')
      .populate('inclusions.roomId', 'name code status')
      .populate('additionalRoomDiscount.appliesToRoomIds', 'name code status')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(promos, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to load promos.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;

    await connectDB();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body.' }, { status: 400 });
    }

    const { errors, payload } = validateCreatePayload(body);
    if (errors.length > 0 || !payload) {
      return NextResponse.json({ success: false, message: 'Invalid promo data.', errors }, { status: 400 });
    }

    const roomIds = collectReferencedRoomIds(payload);
    const missingRoomIds = await validateRoomReferences(roomIds);
    if (missingRoomIds.length > 0) {
      return NextResponse.json({ success: false, message: 'One or more room references are invalid or archived.', errors: ['Some referenced rooms do not exist or are archived.'] }, { status: 400 });
    }

    const promo = await Promo.create(payload);

    return NextResponse.json({ success: true, promo }, { status: 201 });
  } catch (error: unknown) {
    const errorWithDetails = error as { code?: unknown; name?: unknown; message?: string };

    if (errorWithDetails.code === 11000) {
      return NextResponse.json({ success: false, message: 'A promo with this code already exists.' }, { status: 409 });
    }

    if (errorWithDetails.name === 'ValidationError') {
      return NextResponse.json({ success: false, message: 'Validation failed.', errors: errorWithDetails.message }, { status: 400 });
    }

    return NextResponse.json({ success: false, message: 'Failed to create promo.' }, { status: 500 });
  }
}