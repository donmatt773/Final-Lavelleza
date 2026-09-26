import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/app/lib/db';
import { calculateReservationPricing } from '@/app/lib/reservationPricing';
import { validateSelectedPromoEligibility } from '@/app/lib/promoEligibility';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDateInput(value: unknown, fieldName: string, errors: string[]) {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${fieldName} is required.`);
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    errors.push(`${fieldName} must be a valid date.`);
    return null;
  }

  return date;
}

export async function POST(request: Request) {
  try {
    await connectDB();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body.' }, { status: 400 });
    }

    if (!isRecord(body)) {
      return NextResponse.json({ success: false, message: 'Request body must be a JSON object.' }, { status: 400 });
    }

    const errors: string[] = [];

    const roomAssignments = Array.isArray(body.roomAssignments)
      ? body.roomAssignments.filter((item): item is Record<string, unknown> => isRecord(item))
          .map((item) => ({ roomId: typeof item.room === 'string' ? item.room.trim() : '', adults: Number(item.adults), children: Number(item.children) }))
      : [];
    const roomId = typeof body.room === 'string' ? body.room.trim() : '';
    const selectedRoomIds = roomAssignments.length > 0 ? roomAssignments.map((assignment) => assignment.roomId) : roomId ? [roomId] : [];
    if (selectedRoomIds.length === 0) errors.push('At least one room is required.');
    if (new Set(selectedRoomIds).size !== selectedRoomIds.length) errors.push('Rooms must be unique.');
    selectedRoomIds.forEach((id) => {
      if (!mongoose.Types.ObjectId.isValid(id)) errors.push('Each room must have a valid room ID.');
    });
    roomAssignments.forEach((assignment) => {
      if (!Number.isInteger(assignment.adults) || assignment.adults < 1) errors.push('Adults for each room must be a whole number of at least 1.');
      if (!Number.isInteger(assignment.children) || assignment.children < 0) errors.push('Children for each room must be a non-negative whole number.');
    });

    const promoIdRaw = typeof body.promo === 'string' ? body.promo.trim() : '';
    const promoId = promoIdRaw || null;
    if (promoId && !mongoose.Types.ObjectId.isValid(promoId)) {
      errors.push('Promo must be a valid promo ID.');
    }

    const checkIn = parseDateInput(body.checkIn, 'Check-in date', errors);
    const checkOut = parseDateInput(body.checkOut, 'Check-out date', errors);

    const adults = Number(body.adults);
    if (!Number.isFinite(adults) || adults < 1) {
      errors.push('Adults must be at least 1.');
    }

    const children = Number(body.children);
    if (!Number.isFinite(children) || children < 0) {
      errors.push('Children cannot be negative.');
    }

    if (checkIn && checkOut && checkOut <= checkIn) {
      errors.push('Check-out date must be later than check-in date.');
    }

    if (errors.length > 0) {
      return NextResponse.json({ success: false, message: 'Invalid pricing request.', errors }, { status: 400 });
    }

    if (promoId) {
      const promoEligibility = await validateSelectedPromoEligibility({
        promoId,
        roomIds: selectedRoomIds,
        checkIn: checkIn as Date,
        checkOut: checkOut as Date,
      });

      if (!promoEligibility.valid) {
        return NextResponse.json({ success: false, message: promoEligibility.message }, { status: 400 });
      }
    }

    const pricingSummary = await calculateReservationPricing({
      roomId: selectedRoomIds[0],
      roomAssignments: roomAssignments.length > 0 ? roomAssignments : undefined,
      promoId,
      checkIn: checkIn as Date,
      checkOut: checkOut as Date,
      adults,
      children,
      addOns: Array.isArray(body.addOns)
        ? body.addOns.filter((item): item is { addOnId: string; quantity: number } => isRecord(item) && typeof item.addOnId === 'string')
            .map((item) => ({ addOnId: item.addOnId, quantity: Number(item.quantity) }))
        : [],
    });

    return NextResponse.json({ success: true, pricingSummary }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to compute reservation pricing.' }, { status: 500 });
  }
}
