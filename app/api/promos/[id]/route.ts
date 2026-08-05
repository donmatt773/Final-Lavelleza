import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/app/lib/db';
import Promo, { getPromoEffectiveStatus, resolvePromoStatus } from '@/app/lib/Promo';
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

function sanitizeImage(value: unknown, errors: string[]) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'object') {
    errors.push('Image/banner must be an object.');
    return undefined;
  }

  const image = value as Record<string, unknown>;
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

function sanitizeAdditionalRoomDiscount(value: unknown, errors: string[]) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!value || typeof value !== 'object') {
    errors.push('additionalRoomDiscount must be an object.');
    return undefined;
  }

  const discount = value as Record<string, unknown>;
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

function validateUpdatePayload(body: unknown) {
  const errors: string[] = [];
  if (!body || typeof body !== 'object') {
    return { errors: ['Request body must be a JSON object.'], payload: null as Record<string, unknown> | null };
  }

  const input = body as Record<string, unknown>;
  const payload: Record<string, unknown> = {};

  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || !input.name.trim()) {
      errors.push('Promo name must be a non-empty string.');
    } else {
      payload.name = input.name.trim();
    }
  }

  if (input.code !== undefined) {
    if (typeof input.code !== 'string' || !input.code.trim()) {
      errors.push('Promo code must be a non-empty string.');
    } else {
      payload.code = input.code.trim().toUpperCase();
    }
  }

  if (input.packagePrice !== undefined) {
    const packagePrice = Number(input.packagePrice);
    if (!Number.isFinite(packagePrice) || packagePrice < 0) {
      errors.push('Package price must be a non-negative number.');
    } else {
      payload.packagePrice = packagePrice;
    }
  }

  if (input.status !== undefined) {
    const status = String(input.status).toUpperCase();
    if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      errors.push('Promo status must be DRAFT, ACTIVE, INACTIVE, or EXPIRED.');
    } else {
      payload.status = status;
    }
  }

  const startDate = parseDate(input.startDate, 'startDate', errors);
  const endDate = parseDate(input.endDate, 'endDate', errors);
  if (input.startDate !== undefined) payload.startDate = startDate;
  if (input.endDate !== undefined) payload.endDate = endDate;

  if (input.description !== undefined) {
    payload.description = typeof input.description === 'string' ? input.description.trim() : '';
  }

  if (input.notes !== undefined) {
    payload.notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  }

  if (input.timezone !== undefined) {
    if (typeof input.timezone !== 'string' || !input.timezone.trim()) {
      errors.push('timezone must be a non-empty string.');
    } else {
      payload.timezone = input.timezone.trim();
    }
  }

  if (input.currency !== undefined) {
    if (typeof input.currency !== 'string' || !input.currency.trim()) {
      errors.push('currency must be a non-empty string.');
    } else {
      payload.currency = input.currency.trim().toUpperCase();
    }
  }

  if (input.includedPax !== undefined) {
    const includedPax = Number(input.includedPax);
    if (!Number.isFinite(includedPax) || includedPax < 1) {
      errors.push('includedPax must be a number greater than or equal to 1.');
    } else {
      payload.includedPax = includedPax;
    }
  }

  const banner = sanitizeImage(input.banner, errors);
  if (banner !== undefined) payload.banner = banner;

  const inclusions = sanitizeInclusions(input.inclusions, errors);
  if (inclusions !== undefined) payload.inclusions = inclusions;

  const includedRoomIds = sanitizeRoomIds(input.includedRoomIds, 'includedRoomIds', errors);
  if (includedRoomIds !== undefined) payload.includedRoomIds = includedRoomIds;

  const additionalRoomDiscount = sanitizeAdditionalRoomDiscount(input.additionalRoomDiscount, errors);
  if (additionalRoomDiscount !== undefined) payload.additionalRoomDiscount = additionalRoomDiscount;

  if (input.termsAndConditions !== undefined) {
    if (!Array.isArray(input.termsAndConditions) || input.termsAndConditions.some((term) => typeof term !== 'string')) {
      errors.push('termsAndConditions must be an array of strings.');
    } else {
      payload.termsAndConditions = input.termsAndConditions.map((term) => term.trim()).filter(Boolean);
    }
  }

  if (input.isArchived !== undefined) {
    if (typeof input.isArchived !== 'boolean') {
      errors.push('isArchived must be a boolean.');
    } else {
      payload.isArchived = input.isArchived;
    }
  }

  return { errors, payload };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid promo ID.' }, { status: 400 });
    }

    const promo = await Promo.findById(id)
      .populate('includedRoomIds', 'name code status')
      .populate('inclusions.roomId', 'name code status')
      .populate('additionalRoomDiscount.appliesToRoomIds', 'name code status')
      .lean();

    if (!promo) {
      return NextResponse.json({ success: false, message: 'Promo not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, promo }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to load promo.' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid promo ID.' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body.' }, { status: 400 });
    }

    const { errors, payload } = validateUpdatePayload(body);
    if (errors.length > 0 || !payload) {
      return NextResponse.json({ success: false, message: 'Invalid promo data.', errors }, { status: 400 });
    }

    if (!payload.name || typeof payload.name !== 'string' || !payload.name.trim()) {
      return NextResponse.json({ success: false, message: 'Promo name is required.' }, { status: 400 });
    }

    if (!payload.code || typeof payload.code !== 'string' || !payload.code.trim()) {
      return NextResponse.json({ success: false, message: 'Promo code is required.' }, { status: 400 });
    }

    if (payload.packagePrice === undefined || !Number.isFinite(Number(payload.packagePrice)) || Number(payload.packagePrice) < 0) {
      return NextResponse.json({ success: false, message: 'Package price must be a non-negative number.' }, { status: 400 });
    }

    const promo = await Promo.findById(id);
    if (!promo) {
      return NextResponse.json({ success: false, message: 'Promo not found.' }, { status: 404 });
    }

    const nextStartDate = payload.startDate !== undefined ? payload.startDate : promo.startDate;
    const nextEndDate = payload.endDate !== undefined ? payload.endDate : promo.endDate;
    const nextStatus = payload.status !== undefined ? payload.status : promo.status;

    if (nextStartDate && nextEndDate && nextEndDate < nextStartDate) {
      return NextResponse.json({ success: false, message: 'End date must be greater than or equal to start date.' }, { status: 400 });
    }

    if (nextStatus === 'ACTIVE' && (!nextStartDate || !nextEndDate)) {
      return NextResponse.json({ success: false, message: 'ACTIVE promos require startDate and endDate.' }, { status: 400 });
    }

    const roomIds = collectReferencedRoomIds(payload);
    const missingRoomIds = await validateRoomReferences(roomIds);
    if (missingRoomIds.length > 0) {
      return NextResponse.json({ success: false, message: 'One or more room references are invalid or archived.', errors: ['Some referenced rooms do not exist or are archived.'] }, { status: 400 });
    }

    if (payload.status !== undefined) {
      payload.status = resolvePromoStatus(
        String(payload.status),
        payload.startDate as Date | undefined,
        payload.endDate as Date | undefined,
        nextStartDate,
        nextEndDate
      );
    }

    promo.set(payload);
    await promo.save();

    const updatedPromo = await Promo.findById(id)
      .populate('includedRoomIds', 'name code status')
      .populate('inclusions.roomId', 'name code status')
      .populate('additionalRoomDiscount.appliesToRoomIds', 'name code status');

    return NextResponse.json({ success: true, promo: updatedPromo }, { status: 200 });
  } catch (error: unknown) {
    const errorWithDetails = error as { code?: unknown; name?: unknown; message?: string };

    if (errorWithDetails.code === 11000) {
      return NextResponse.json({ success: false, message: 'A promo with this code already exists.' }, { status: 409 });
    }

    if (errorWithDetails.name === 'ValidationError') {
      return NextResponse.json({ success: false, message: 'Validation failed.', errors: errorWithDetails.message }, { status: 400 });
    }

    return NextResponse.json({ success: false, message: 'Failed to update promo.' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid promo ID.' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body.' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, message: 'Request body must be a JSON object.' }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    const allowedFields = ['status', 'isArchived'];
    const invalidFields = Object.keys(input).filter((field) => !allowedFields.includes(field));

    if (invalidFields.length > 0) {
      return NextResponse.json({ success: false, message: 'Only status and isArchived updates are allowed.' }, { status: 400 });
    }

    const promo = await Promo.findById(id);
    if (!promo) {
      return NextResponse.json({ success: false, message: 'Promo not found.' }, { status: 404 });
    }

    if (input.status !== undefined) {
      const status = String(input.status).toUpperCase();
      if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
        return NextResponse.json({ success: false, message: 'Promo status must be DRAFT, ACTIVE, INACTIVE, or EXPIRED.' }, { status: 400 });
      }

      const normalizedStatus = getPromoEffectiveStatus(status, promo.startDate, promo.endDate);
      if (normalizedStatus === 'ACTIVE' && (!promo.startDate || !promo.endDate)) {
        return NextResponse.json({ success: false, message: 'ACTIVE promos require startDate and endDate.' }, { status: 400 });
      }

      promo.status = normalizedStatus as typeof promo.status;
    }

    if (input.isArchived !== undefined) {
      if (typeof input.isArchived !== 'boolean') {
        return NextResponse.json({ success: false, message: 'isArchived must be a boolean.' }, { status: 400 });
      }
      promo.isArchived = input.isArchived;

      if (input.isArchived && promo.status === 'ACTIVE') {
        promo.status = 'INACTIVE';
      }
    }

    await promo.save();

    return NextResponse.json({ success: true, promo }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to update promo status.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid promo ID.' }, { status: 400 });
    }

    const deletedPromo = await Promo.findByIdAndDelete(id);
    if (!deletedPromo) {
      return NextResponse.json({ success: false, message: 'Promo not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Promo permanently deleted.' }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to delete promo.' }, { status: 500 });
  }
}