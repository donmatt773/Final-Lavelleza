import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/app/lib/db';
import Room from '@/app/lib/Room';
import BedType from '@/app/lib/BedType';
import Feature from '@/app/lib/Feature';
import Amenity from '@/app/lib/Amenity';
import { requireOwner } from '@/app/lib/auth';
import { getRoomAvailabilityLabels } from '@/app/lib/reservationAvailability';

const VALID_STATUSES = ['AVAILABLE', 'MAINTENANCE', 'INACTIVE'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidObjectId(value: unknown): value is string {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveReferences(features: unknown, amenities: unknown, beds: unknown) {
  const errors: string[] = [];
  const resolvedFeatures: string[] = [];
  const resolvedAmenities: string[] = [];
  const resolvedBeds: Array<{ bedTypeId: mongoose.Types.ObjectId; quantity: number }> = [];

  if (Array.isArray(features)) {
    for (const item of features) {
      if (typeof item !== 'string' || !item.trim()) {
        errors.push('Each feature must be a non-empty string.');
        continue;
      }

      const featureName = item.trim();
      let featureDoc = await Feature.findOne({
        $or: [{ slug: slugify(featureName) }, { name: { $regex: `^${escapeRegExp(featureName)}$`, $options: 'i' } }],
      });

      if (!featureDoc) {
        featureDoc = await Feature.create({ name: featureName, slug: slugify(featureName) || 'feature', isActive: true, sortOrder: 0 });
      }

      resolvedFeatures.push(String(featureDoc._id));
    }
  }

  if (Array.isArray(amenities)) {
    for (const item of amenities) {
      if (typeof item !== 'string' || !item.trim()) {
        errors.push('Each amenity must be a non-empty string.');
        continue;
      }

      const amenityName = item.trim();
      let amenityDoc = await Amenity.findOne({
        $or: [{ slug: slugify(amenityName) }, { name: { $regex: `^${escapeRegExp(amenityName)}$`, $options: 'i' } }],
      });

      if (!amenityDoc) {
        amenityDoc = await Amenity.create({ name: amenityName, slug: slugify(amenityName) || 'amenity', isActive: true, sortOrder: 0 });
      }

      resolvedAmenities.push(String(amenityDoc._id));
    }
  }

  if (Array.isArray(beds)) {
    for (const bed of beds) {
      if (!bed || typeof bed !== 'object') {
        errors.push('Each bed entry must be an object.');
        continue;
      }

      if (!isRecord(bed)) {
        errors.push('Each bed entry must be an object.');
        continue;
      }

      const bedTypeValue = bed.bedTypeId;
      const quantity = Number(bed.quantity);

      if (typeof bedTypeValue !== 'string' || !bedTypeValue.trim()) {
        errors.push('Each bed must include a bed type.');
        continue;
      }

      if (!Number.isFinite(quantity) || quantity < 1) {
        errors.push('Each bed quantity must be a number greater than zero.');
        continue;
      }

      let bedTypeDoc: { _id: mongoose.Types.ObjectId } | null = null;
      if (isValidObjectId(bedTypeValue)) {
        bedTypeDoc = await BedType.findById(bedTypeValue);
      } else {
        bedTypeDoc = await BedType.findOne({
          $or: [{ slug: slugify(bedTypeValue) }, { name: { $regex: `^${escapeRegExp(bedTypeValue)}$`, $options: 'i' } }],
        });
      }

      if (!bedTypeDoc) {
        bedTypeDoc = await BedType.create({ name: bedTypeValue.trim(), slug: slugify(bedTypeValue.trim()) || 'bed-type', isActive: true, sortOrder: 0 });
      }

      resolvedBeds.push({ bedTypeId: bedTypeDoc._id, quantity });
    }
  }

  return { errors, resolvedFeatures, resolvedAmenities, resolvedBeds };
}

function buildRoomQuery(search?: string | null, status?: string | null) {
  const query: Record<string, unknown> = { isArchived: false };

  if (search) {
    const sanitized = search.trim();
    if (sanitized) {
      query.$or = [
        { name: { $regex: sanitized, $options: 'i' } },
        { code: { $regex: sanitized, $options: 'i' } },
        { description: { $regex: sanitized, $options: 'i' } },
      ];
    }
  }

  if (status && VALID_STATUSES.includes(status)) {
    query.status = status;
  }

  return query;
}

function validateCreatePayload(body: unknown) {
  const errors: string[] = [];
  const input = isRecord(body) ? body : null;

  if (!input) {
    return ['Request body must be a JSON object.'];
  }

  if (typeof input.name !== 'string' || !input.name.trim()) {
    errors.push('Room name is required.');
  }

  if (typeof input.code !== 'string' || !input.code.trim()) {
    errors.push('Room code is required.');
  }

  if (typeof input.maxGuests !== 'number' || !Number.isFinite(input.maxGuests) || input.maxGuests < 1) {
    errors.push('Maximum guests must be a number greater than zero.');
  }

  if (typeof input.nightlyRate !== 'number' || !Number.isFinite(input.nightlyRate) || input.nightlyRate < 0) {
    errors.push('Nightly rate must be a non-negative number.');
  }

  if (typeof input.halfDayRate !== 'number' || !Number.isFinite(input.halfDayRate) || input.halfDayRate < 0) {
    errors.push('Half-day rate must be a non-negative number.');
  }

  if (typeof input.wholeDayRate !== 'number' || !Number.isFinite(input.wholeDayRate) || input.wholeDayRate < 0) {
    errors.push('Whole-day rate must be a non-negative number.');
  }

  if (typeof input.status !== 'string' || !VALID_STATUSES.includes(input.status as (typeof VALID_STATUSES)[number])) {
    errors.push('Room status must be AVAILABLE, MAINTENANCE, or INACTIVE.');
  }

  if (!Array.isArray(input.beds) || input.beds.length === 0) {
    errors.push('At least one bed entry is required.');
  }

  return errors;
}

export async function GET(request: Request) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;

    await connectDB();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const includeArchived = searchParams.get('includeArchived') === 'true';

    const query = buildRoomQuery(search, status);
    if (includeArchived) {
      delete query.isArchived;
    }

    const rooms = await Room.find(query)
      .populate('beds.bedTypeId', 'name slug')
      .populate('features', 'name slug')
      .populate('amenities', 'name slug')
      .sort({ createdAt: -1 })
      .lean();

    const roomIds = rooms.map((room) => String(room._id));
    const availabilityLabels = await getRoomAvailabilityLabels(roomIds);
    const roomsWithAvailability = rooms.map((room) => ({
      ...room,
      availabilityLabel: availabilityLabels.get(String(room._id)) || 'AVAILABLE',
    }));

    return NextResponse.json(roomsWithAvailability, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to load rooms.' }, { status: 500 });
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
    const input = isRecord(body) ? body : null;
    if (!input) {
      return NextResponse.json({ success: false, message: 'Request body must be a JSON object.' }, { status: 400 });
    }

    const validationErrors = validateCreatePayload(input);

    if (validationErrors.length > 0) {
      return NextResponse.json({ success: false, message: 'Invalid room data.', errors: validationErrors }, { status: 400 });
    }

    const referenceData = await resolveReferences(input.features, input.amenities, input.beds);
    if (referenceData.errors.length > 0) {
      return NextResponse.json({ success: false, message: 'Invalid references provided.', errors: referenceData.errors }, { status: 400 });
    }

    const room = await Room.create({
  name: typeof input.name === 'string' ? input.name.trim() : '',
  code: typeof input.code === 'string' ? input.code.trim().toUpperCase() : '',
  description: typeof input.description === 'string' ? input.description.trim() : '',
  maxGuests: input.maxGuests as number,
  status: input.status as 'AVAILABLE' | 'MAINTENANCE' | 'INACTIVE',
  nightlyRate: input.nightlyRate as number,
  halfDayRate: input.halfDayRate as number,
  wholeDayRate: input.wholeDayRate as number,
  beds: referenceData.resolvedBeds,
  features: referenceData.resolvedFeatures,
  amenities: referenceData.resolvedAmenities,
  images: Array.isArray(input.images) ? input.images : [],
  primaryImageId: typeof input.primaryImageId === 'string' ? input.primaryImageId : null,
  isArchived: false,
  archivedAt: null,
});

    return NextResponse.json({ success: true, room }, { status: 201 });
  } catch (error: unknown) {
    const errorWithDetails = error as { code?: unknown; name?: unknown; message?: string };

    if (errorWithDetails.code === 11000) {
      return NextResponse.json({ success: false, message: 'A room with this code or name already exists.' }, { status: 409 });
    }

    if (errorWithDetails.name === 'ValidationError') {
      return NextResponse.json({ success: false, message: 'Validation failed.', errors: errorWithDetails.message }, { status: 400 });
    }

    return NextResponse.json({ success: false, message: 'Failed to create room.' }, { status: 500 });
  }
}
