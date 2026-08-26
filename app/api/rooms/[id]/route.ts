import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/app/lib/db';
import Room from '@/app/lib/Room';
import BedType from '@/app/lib/BedType';
import Feature from '@/app/lib/Feature';
import Amenity from '@/app/lib/Amenity';
import { requireOwner } from '@/app/lib/auth';

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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid room ID.' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get('includeArchived') === 'true';

    const room = await Room.findById(id)
      .populate('beds.bedTypeId', 'name slug')
      .populate('features', 'name slug')
      .populate('amenities', 'name slug')
      .lean();

    if (!room) {
      return NextResponse.json({ success: false, message: 'Room not found.' }, { status: 404 });
    }

    if (room.isArchived && !includeArchived) {
      return NextResponse.json({ success: false, message: 'Room is archived. Restore it first to view details.' }, { status: 410 });
    }

    return NextResponse.json({ success: true, room }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to load room.' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid room ID.' }, { status: 400 });
    }

    const existingRoom = await Room.findById(id).select('isArchived').lean();
    if (!existingRoom) {
      return NextResponse.json({ success: false, message: 'Room not found.' }, { status: 404 });
    }

    if (existingRoom.isArchived) {
      return NextResponse.json({ success: false, message: 'Room is archived. Restore it first before editing.' }, { status: 409 });
    }

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

    const validationErrors = [] as string[];
    if (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim())) {
      validationErrors.push('Room name must be a non-empty string.');
    }

    if (input.code !== undefined && (typeof input.code !== 'string' || !input.code.trim())) {
      validationErrors.push('Room code must be a non-empty string.');
    }

    if (input.maxGuests !== undefined && (typeof input.maxGuests !== 'number' || !Number.isFinite(input.maxGuests) || input.maxGuests < 1)) {
      validationErrors.push('Maximum guests must be a number greater than zero.');
    }

    if (input.nightlyRate !== undefined && (typeof input.nightlyRate !== 'number' || !Number.isFinite(input.nightlyRate) || input.nightlyRate < 0)) {
      validationErrors.push('Nightly rate must be a non-negative number.');
    }

    if (input.halfDayRate !== undefined && (typeof input.halfDayRate !== 'number' || !Number.isFinite(input.halfDayRate) || input.halfDayRate < 0)) {
      validationErrors.push('Half-day rate must be a non-negative number.');
    }

    if (input.wholeDayRate !== undefined && (typeof input.wholeDayRate !== 'number' || !Number.isFinite(input.wholeDayRate) || input.wholeDayRate < 0)) {
      validationErrors.push('Whole-day rate must be a non-negative number.');
    }

    if (input.status !== undefined && (typeof input.status !== 'string' || !VALID_STATUSES.includes(input.status as (typeof VALID_STATUSES)[number]))) {
      validationErrors.push('Room status must be AVAILABLE, MAINTENANCE, or INACTIVE.');
    }

    if (input.beds !== undefined && (!Array.isArray(input.beds) || input.beds.length === 0)) {
      validationErrors.push('Beds must be a non-empty array.');
    }

    if (validationErrors.length > 0) {
      return NextResponse.json({ success: false, message: 'Invalid room data.', errors: validationErrors }, { status: 400 });
    }

    const referenceData = await resolveReferences(input.features, input.amenities, input.beds);
    if (referenceData.errors.length > 0) {
      return NextResponse.json({ success: false, message: 'Invalid references provided.', errors: referenceData.errors }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {};
    if (input.name !== undefined) updatePayload.name = typeof input.name === 'string' ? input.name.trim() : input.name;
    if (input.code !== undefined) updatePayload.code = typeof input.code === 'string' ? input.code.trim().toUpperCase() : input.code;
    if (input.description !== undefined) updatePayload.description = typeof input.description === 'string' ? input.description.trim() : input.description;
    if (input.maxGuests !== undefined) updatePayload.maxGuests = input.maxGuests;
    if (input.status !== undefined) updatePayload.status = input.status;
    if (input.nightlyRate !== undefined) updatePayload.nightlyRate = input.nightlyRate;
    if (input.halfDayRate !== undefined) updatePayload.halfDayRate = input.halfDayRate;
    if (input.wholeDayRate !== undefined) updatePayload.wholeDayRate = input.wholeDayRate;
    if (input.beds !== undefined) updatePayload.beds = referenceData.resolvedBeds;
    if (input.features !== undefined) updatePayload.features = referenceData.resolvedFeatures;
    if (input.amenities !== undefined) updatePayload.amenities = referenceData.resolvedAmenities;
    if (input.images !== undefined) updatePayload.images = Array.isArray(input.images) ? input.images : [];
    if (input.primaryImageId !== undefined) updatePayload.primaryImageId = input.primaryImageId || null;
    if (input.isArchived !== undefined) updatePayload.isArchived = input.isArchived;
    if (input.archivedAt !== undefined) updatePayload.archivedAt = input.archivedAt;

    const updatedRoom = await Room.findByIdAndUpdate(id, updatePayload, { returnDocument: 'after', runValidators: true });

    if (!updatedRoom) {
      return NextResponse.json({ success: false, message: 'Room not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, room: updatedRoom }, { status: 200 });
  } catch (error: unknown) {
    const errorWithDetails = error as { code?: unknown; name?: unknown; message?: string };

    if (errorWithDetails.code === 11000) {
      return NextResponse.json({ success: false, message: 'A room with this code or name already exists.' }, { status: 409 });
    }

    if (errorWithDetails.name === 'ValidationError') {
      return NextResponse.json({ success: false, message: 'Validation failed.', errors: errorWithDetails.message }, { status: 400 });
    }

    return NextResponse.json({ success: false, message: 'Failed to update room.' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid room ID.' }, { status: 400 });
    }

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

    const existingRoom = await Room.findById(id).select('isArchived').lean();
    if (!existingRoom) {
      return NextResponse.json({ success: false, message: 'Room not found.' }, { status: 404 });
    }

    const allowedFields = ['status', 'isArchived'];
    const invalidFields = Object.keys(input).filter((field) => !allowedFields.includes(field));
    if (invalidFields.length > 0) {
      return NextResponse.json({ success: false, message: 'Only status and isArchived updates are allowed.' }, { status: 400 });
    }
    if (!input) {
      return NextResponse.json({ success: false, message: 'Request body must be a JSON object.' }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {};
    if (input.status !== undefined) {
      if (typeof input.status !== 'string' || !VALID_STATUSES.includes(input.status as (typeof VALID_STATUSES)[number])) {
        return NextResponse.json({ success: false, message: 'Room status must be AVAILABLE, MAINTENANCE, or INACTIVE.' }, { status: 400 });
      }
      updatePayload.status = input.status;
    }

    if (input.isArchived !== undefined) {
      updatePayload.isArchived = input.isArchived;
      if (input.isArchived) {
        updatePayload.archivedAt = new Date();
      } else {
        updatePayload.archivedAt = null;
      }
    }

    // Archived rooms can only be changed through explicit restore.
    if (existingRoom.isArchived && input.isArchived !== false) {
      return NextResponse.json({ success: false, message: 'Room is archived. Send isArchived=false to restore before other updates.' }, { status: 409 });
    }

    const updatedRoom = await Room.findByIdAndUpdate(id, updatePayload, { returnDocument: 'after', runValidators: true });

    if (!updatedRoom) {
      return NextResponse.json({ success: false, message: 'Room not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, room: updatedRoom }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to update room status.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid room ID.' }, { status: 400 });
    }

    const deletedRoom = await Room.findByIdAndDelete(id);
    if (!deletedRoom) {
      return NextResponse.json({ success: false, message: 'Room not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Room permanently deleted.' }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to delete room.' }, { status: 500 });
  }
}
