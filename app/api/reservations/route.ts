import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/app/lib/db';
import Reservation from '@/app/lib/Reservation';
import Room from '@/app/lib/Room';
import Payment from '@/app/lib/Payment';
import { getSessionFromRequest, requireOwnerOrStaff } from '@/app/lib/auth';
import { findConflictingReservation, hasValidDateRange } from '@/app/lib/reservationAvailability';
import { calculateReservationPricing } from '@/app/lib/reservationPricing';
import { validateSelectedPromoEligibility } from '@/app/lib/promoEligibility';
import { generatePaymentNumber } from '@/app/lib/paymentTracking';

const VALID_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'CHECKED_IN', 'CHECKED_OUT'] as const;
const VALID_PAYMENT_STATUSES = ['UNPAID', 'PENDING_VERIFICATION', 'PARTIALLY_PAID', 'PAID', 'REFUNDED'] as const;
const VALID_RESERVATION_SOURCES = ['ONLINE', 'WALK_IN'] as const;
const VALID_PAYMENT_METHODS = ['CASH_ON_ARRIVAL', 'GCASH'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidObjectId(value: unknown): value is string {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);
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

function toStartOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseMonthRange(monthKey: string | null) {
  if (!monthKey) return null;
  const trimmed = monthKey.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

function parseDateOnlyInput(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = /^\d{4}-\d{2}-\d{2}$/.exec(trimmed);
  if (!match) return null;

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

async function generateReservationNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const prefix = `RSV-${year}${month}${day}`;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const reservationNumber = `${prefix}-${suffix}`;
    const exists = await Reservation.exists({ reservationNumber });
    if (!exists) return reservationNumber;
  }

  const fallbackSuffix = `${Date.now()}`.slice(-6);
  return `${prefix}-${fallbackSuffix}`;
}

export async function GET(request: Request) {
  try {
    const authError = requireOwnerOrStaff(request);
    if (authError) return authError;

    await connectDB();
    const { searchParams } = new URL(request.url);

    const search = searchParams.get('search')?.trim() || '';
    const reservationStatus = (searchParams.get('reservationStatus') || '').toUpperCase();
    const paymentStatus = (searchParams.get('paymentStatus') || '').toUpperCase();
    const reservationSource = (searchParams.get('reservationSource') || '').toUpperCase();
    const filter = (searchParams.get('filter') || '').toUpperCase();
    const month = searchParams.get('month');
    const startDateRaw = searchParams.get('startDate');
    const endDateRaw = searchParams.get('endDate');

    const query: Record<string, unknown> = {};

    if (search) {
      query.$or = [
        { reservationNumber: { $regex: search, $options: 'i' } },
        { guestName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    if (VALID_RESERVATION_STATUSES.includes(reservationStatus as (typeof VALID_RESERVATION_STATUSES)[number])) {
      query.reservationStatus = reservationStatus;
    }

    if (VALID_PAYMENT_STATUSES.includes(paymentStatus as (typeof VALID_PAYMENT_STATUSES)[number])) {
      query.paymentStatus = paymentStatus;
    }

    if (VALID_RESERVATION_SOURCES.includes(reservationSource as (typeof VALID_RESERVATION_SOURCES)[number])) {
      query.reservationSource = reservationSource;
    }

    const monthRange = parseMonthRange(month);
    if (month && !monthRange) {
      return NextResponse.json({ success: false, message: 'Invalid month format. Use YYYY-MM.' }, { status: 400 });
    }

    const startDate = parseDateOnlyInput(startDateRaw);
    const endDate = parseDateOnlyInput(endDateRaw);

    if (startDateRaw && !startDate) {
      return NextResponse.json({ success: false, message: 'Invalid startDate format. Use YYYY-MM-DD.' }, { status: 400 });
    }

    if (endDateRaw && !endDate) {
      return NextResponse.json({ success: false, message: 'Invalid endDate format. Use YYYY-MM-DD.' }, { status: 400 });
    }

    if (startDate && endDate && endDate < startDate) {
      return NextResponse.json({ success: false, message: 'endDate must be greater than or equal to startDate.' }, { status: 400 });
    }

    let rangeStart: Date | null = monthRange ? monthRange.start : null;
    let rangeEndExclusive: Date | null = monthRange ? monthRange.end : null;

    if (startDate) {
      rangeStart = rangeStart ? (startDate > rangeStart ? startDate : rangeStart) : startDate;
    }

    if (endDate) {
      const endDateExclusive = new Date(endDate);
      endDateExclusive.setDate(endDateExclusive.getDate() + 1);
      rangeEndExclusive = rangeEndExclusive
        ? (endDateExclusive < rangeEndExclusive ? endDateExclusive : rangeEndExclusive)
        : endDateExclusive;
    }

    if (rangeStart && rangeEndExclusive && rangeStart >= rangeEndExclusive) {
      return NextResponse.json([], { status: 200 });
    }

    if (rangeStart && rangeEndExclusive) {
      query.checkIn = { $lt: rangeEndExclusive };
      query.checkOut = { $gte: rangeStart };
    } else if (rangeStart) {
      query.checkOut = { $gte: rangeStart };
    } else if (rangeEndExclusive) {
      query.checkIn = { $lt: rangeEndExclusive };
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    if (filter === 'PENDING') {
      query.reservationStatus = 'PENDING';
    } else if (filter === 'CONFIRMED') {
      query.reservationStatus = 'CONFIRMED';
    } else if (filter === 'CANCELLED') {
      query.reservationStatus = 'CANCELLED';
    } else if (filter === 'CHECKIN_TODAY') {
      query.checkIn = { $gte: todayStart, $lt: tomorrowStart };
    } else if (filter === 'CHECKOUT_TODAY') {
      query.checkOut = { $gte: todayStart, $lt: tomorrowStart };
    }

    const reservations = await Reservation.find(query)
      .populate('room', 'name code')
      .populate('promo', 'name code inclusions')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(reservations, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to load reservations.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await connectDB();

    const session = getSessionFromRequest(request);

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

    const requestedReservationSource = typeof body.reservationSource === 'string'
      ? body.reservationSource.trim().toUpperCase()
      : 'ONLINE';

    if (!VALID_RESERVATION_SOURCES.includes(requestedReservationSource as (typeof VALID_RESERVATION_SOURCES)[number])) {
      errors.push('reservationSource must be ONLINE or WALK_IN.');
    }

    const isWalkInRequest = requestedReservationSource === 'WALK_IN';
    const isOnlineRequest = !isWalkInRequest;
    const requestedReservationStatus = typeof body.reservationStatus === 'string'
      ? body.reservationStatus.trim().toUpperCase()
      : '';

    const requestedPaymentMethod = typeof body.paymentMethod === 'string'
      ? body.paymentMethod.trim().toUpperCase()
      : 'CASH_ON_ARRIVAL';

    if (isOnlineRequest && !VALID_PAYMENT_METHODS.includes(requestedPaymentMethod as (typeof VALID_PAYMENT_METHODS)[number])) {
      errors.push('paymentMethod must be CASH_ON_ARRIVAL or GCASH.');
    }

    const gcashReferenceNumber = typeof body.gcashReferenceNumber === 'string' ? body.gcashReferenceNumber.trim() : '';
    const gcashProofOfPaymentUrl = typeof body.gcashProofOfPaymentUrl === 'string' ? body.gcashProofOfPaymentUrl.trim() : '';
    const gcashAmountPaid = Number(body.gcashAmountPaid);

    if (isWalkInRequest) {
      const authError = requireOwnerOrStaff(request);
      if (authError) return authError;

      if (requestedReservationStatus && requestedReservationStatus !== 'CONFIRMED' && requestedReservationStatus !== 'CHECKED_IN') {
        errors.push('Walk-in reservationStatus must be CONFIRMED or CHECKED_IN.');
      }
    } else if (requestedReservationStatus && requestedReservationStatus !== 'PENDING') {
      errors.push('Online reservationStatus must be PENDING when provided.');
    }

    const guestName = typeof body.guestName === 'string' ? body.guestName.trim() : '';
    if (!guestName) errors.push('Guest name is required.');

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) {
      errors.push('Email is required.');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('Email must be a valid email address.');
    }

    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (!phone) errors.push('Phone is required.');

    const address = typeof body.address === 'string' ? body.address.trim() : '';

    const roomId = typeof body.room === 'string' ? body.room.trim() : '';
    if (!roomId) {
      errors.push('Room is required.');
    } else if (!isValidObjectId(roomId)) {
      errors.push('Room must be a valid room ID.');
    }

    const promoIdRaw = typeof body.promo === 'string' ? body.promo.trim() : '';
    const promoId = promoIdRaw || null;
    if (promoId && !isValidObjectId(promoId)) {
      errors.push('Promo must be a valid promo ID when provided.');
    }

    const checkInRaw = parseDateInput(body.checkIn, 'Check-in date', errors);
    const checkOutRaw = parseDateInput(body.checkOut, 'Check-out date', errors);
    const checkIn = checkInRaw ? toStartOfDay(checkInRaw) : null;
    const checkOut = checkOutRaw ? toStartOfDay(checkOutRaw) : null;

    if (checkIn && checkOut && checkOut <= checkIn) {
      errors.push('Check-out date must be later than check-in date.');
    }

    const adults = Number(body.adults);
    if (!Number.isFinite(adults) || adults < 1) {
      errors.push('Adults must be a number greater than or equal to 1.');
    }

    const children = Number(body.children);
    if (!Number.isFinite(children) || children < 0) {
      errors.push('Children must be a number greater than or equal to 0.');
    }

    const specialRequests = typeof body.specialRequests === 'string' ? body.specialRequests.trim() : '';

    const reservationSource = isWalkInRequest ? 'WALK_IN' : 'ONLINE';
    const reservationStatus = isWalkInRequest
      ? (requestedReservationStatus === 'CHECKED_IN' ? 'CHECKED_IN' : 'CONFIRMED')
      : 'PENDING';

    const isOnlineGcash = isOnlineRequest && requestedPaymentMethod === 'GCASH';

    if (isOnlineGcash) {
      if (!gcashReferenceNumber) {
        errors.push('GCash reference number is required for GCash payments.');
      }

      if (!Number.isFinite(gcashAmountPaid) || gcashAmountPaid <= 0) {
        errors.push('GCash amount paid must be greater than zero.');
      }
    }

    const actingStaffMember = session
      ? `${session.name} (${session.employeeId})`
      : (request.headers.get('x-user-name') || request.headers.get('x-user-id') || 'STAFF');

    if (errors.length > 0) {
      return NextResponse.json({ success: false, message: 'Invalid reservation request.', errors }, { status: 400 });
    }

    const roomDoc = await Room.findOne({ _id: roomId, isArchived: false, status: 'AVAILABLE' }).select('_id').lean();
    if (!roomDoc) {
      return NextResponse.json({ success: false, message: 'Selected room is not available for reservation requests.' }, { status: 400 });
    }

    if (promoId && checkIn && checkOut) {
      const promoEligibility = await validateSelectedPromoEligibility({
        promoId,
        roomId,
        checkIn,
        checkOut,
      });

      if (!promoEligibility.valid) {
        return NextResponse.json({ success: false, message: promoEligibility.message }, { status: 400 });
      }
    }

    if (checkIn && checkOut && hasValidDateRange({ checkIn, checkOut })) {
      const conflictingReservation = await findConflictingReservation({
        roomId,
        checkIn,
        checkOut,
      });

      if (conflictingReservation) {
        return NextResponse.json(
          {
            success: false,
            message: `Selected room is unavailable for the requested dates due to reservation ${String(conflictingReservation.reservationNumber)}.`,
          },
          { status: 409 }
        );
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

    const totalDue = Number(pricingSummary.grandTotal || 0);

    if (isOnlineGcash && Number.isFinite(gcashAmountPaid) && gcashAmountPaid > totalDue) {
      return NextResponse.json({ success: false, message: 'GCash amount cannot exceed outstanding balance.' }, { status: 400 });
    }

    const reservationNumber = await generateReservationNumber();
    const initialReservationPaymentStatus = isOnlineGcash ? 'PENDING_VERIFICATION' : 'UNPAID';

    const reservation = await Reservation.create({
      reservationNumber,
      guestName,
      email,
      phone,
      address: address || undefined,
      room: roomId,
      promo: promoId || null,
      adults: Math.floor(adults),
      children: Math.floor(children),
      checkIn,
      checkOut,
      specialRequests: specialRequests || undefined,
      reservationStatus,
      paymentStatus: initialReservationPaymentStatus,
      reservationSource,
      checkInAt: reservationStatus === 'CHECKED_IN' ? new Date() : null,
      checkedInBy: reservationStatus === 'CHECKED_IN' ? actingStaffMember : null,
      statusHistory: [
        {
          fromStatus: null,
          toStatus: reservationStatus,
          changedAt: new Date(),
          staffMember: reservationSource === 'WALK_IN' ? actingStaffMember : 'PUBLIC',
        },
      ],
      pricingSummary,
      createdBy: reservationSource === 'WALK_IN' ? actingStaffMember : 'PUBLIC',
    });

    if (isOnlineGcash) {
      try {
        const paymentNumber = await generatePaymentNumber();
        const paymentType = gcashAmountPaid >= totalDue ? 'FULL_PAYMENT' : 'RESERVATION_DEPOSIT';

        await Payment.create({
          paymentNumber,
          reservation: reservation._id,
          paymentDate: new Date(),
          paymentMethod: 'GCASH',
          referenceNumber: gcashReferenceNumber,
          amountPaid: gcashAmountPaid,
          balanceRemaining: totalDue,
          paymentType,
          paymentStatus: 'PENDING_VERIFICATION',
          receivedBy: 'GUEST',
          notes: 'Submitted by guest during online reservation.',
          proofOfPaymentUrl: gcashProofOfPaymentUrl || undefined,
        });
      } catch {
        await Reservation.findByIdAndDelete(reservation._id);
        return NextResponse.json({ success: false, message: 'Failed to record GCash payment. Please try again.' }, { status: 500 });
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Reservation request submitted successfully.',
        reservation: {
          _id: reservation._id,
          reservationNumber: reservation.reservationNumber,
          reservationStatus: reservation.reservationStatus,
          paymentStatus: reservation.paymentStatus,
          pricingSummary: reservation.pricingSummary,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const errorWithCode = error as { code?: unknown };
    if (errorWithCode?.code === 11000) {
      return NextResponse.json({ success: false, message: 'Reservation number conflict. Please try again.' }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: 'Failed to submit reservation request.' }, { status: 500 });
  }
}
