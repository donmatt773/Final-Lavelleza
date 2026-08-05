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

    const roomId = typeof body.room === 'string' ? body.room.trim() : '';
    if (!roomId) {
      errors.push('Room is required.');
    } else if (!mongoose.Types.ObjectId.isValid(roomId)) {
      errors.push('Room must be a valid room ID.');
    }

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
        roomId,
        checkIn: checkIn as Date,
        checkOut: checkOut as Date,
      });

      if (!promoEligibility.valid) {
        return NextResponse.json({ success: false, message: promoEligibility.message }, { status: 400 });
      }
    }

    const pricingSummary = await calculateReservationPricing({
      roomId,
      promoId,
      checkIn: checkIn as Date,
      checkOut: checkOut as Date,
      adults,
      children,
    });

    return NextResponse.json({ success: true, pricingSummary }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to compute reservation pricing.' }, { status: 500 });
  }
}
