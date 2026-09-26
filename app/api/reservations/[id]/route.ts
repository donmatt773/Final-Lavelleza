import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/app/lib/db';
import Reservation from '@/app/lib/Reservation';
import Payment from '@/app/lib/Payment';
import Room from '@/app/lib/Room';
import { getSessionFromRequest, requireOwnerOrStaff } from '@/app/lib/auth';
import { findConflictingReservation, hasValidDateRange } from '@/app/lib/reservationAvailability';
import { calculateReservationPricing } from '@/app/lib/reservationPricing';
import { computeReservationPaymentRollup } from '@/app/lib/paymentTracking';
import { validateSelectedPromoEligibility } from '@/app/lib/promoEligibility';
import { triggerReservationUpdate } from '@/app/lib/pusher-server';
import { AddOnAvailabilityError, AddOnInventoryBusyError, withAddOnInventoryLock } from '@/app/lib/addOnAvailability';
import { diffAuditFields, writeAuditLog } from '@/app/lib/auditLogWriter';

const VALID_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'CHECKED_IN', 'CHECKED_OUT'] as const;
const VALID_PAYMENT_STATUSES = ['UNPAID', 'PENDING_VERIFICATION', 'PARTIALLY_PAID', 'PAID', 'REFUNDED'] as const;

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: [],
  CANCELLED: [],
  NO_SHOW: [],
};

function canTransitionReservationStatus(fromStatus: string, toStatus: string) {
  if (fromStatus === toStatus) return true;
  const allowed = ALLOWED_STATUS_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidObjectId(value: unknown): value is string {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireOwnerOrStaff(request);
    if (authError) return authError;

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid reservation ID.' }, { status: 400 });
    }

    const existingReservation = await Reservation.findById(id).lean();
    if (!existingReservation) {
      return NextResponse.json({ success: false, message: 'Reservation not found.' }, { status: 404 });
    }

    const reservation = await Reservation.findById(id)
      .populate('room', 'name code description')
      .populate('roomAssignments.room', 'name code description')
      .populate('promo', 'name code packagePrice inclusions')
      .lean();

    if (!reservation) {
      return NextResponse.json({ success: false, message: 'Reservation not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, reservation }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to load reservation details.' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireOwnerOrStaff(request);
    if (authError) return authError;

    const session = getSessionFromRequest(request);
    const actingStaffMember = session
      ? `${session.name} (${session.employeeId})`
      : (request.headers.get('x-user-name') || request.headers.get('x-user-id') || 'STAFF');

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid reservation ID.' }, { status: 400 });
    }

    const existingReservation = await Reservation.findById(id).lean();
    if (!existingReservation) {
      return NextResponse.json({ success: false, message: 'Reservation not found.' }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body.' }, { status: 400 });
    }

    if (!isRecord(body)) {
      return NextResponse.json({ success: false, message: 'Request body must be a JSON object.' }, { status: 400 });
    }

    if (existingReservation.reservationStatus === 'CHECKED_OUT') {
      return NextResponse.json({
        success: false,
        message: 'Checked-out reservations are locked and cannot be edited.',
      }, { status: 409 });
    }

    const updatePayload: Record<string, unknown> = {};
    const errors: string[] = [];

    if (body.reservationStatus !== undefined) {
      const reservationStatus = String(body.reservationStatus).toUpperCase();
      if (!VALID_RESERVATION_STATUSES.includes(reservationStatus as (typeof VALID_RESERVATION_STATUSES)[number])) {
        errors.push('reservationStatus must be PENDING, CONFIRMED, CANCELLED, NO_SHOW, CHECKED_IN, or CHECKED_OUT.');
      } else {
        updatePayload.reservationStatus = reservationStatus;
      }
    }

    if (body.paymentStatus !== undefined) {
      const paymentStatus = String(body.paymentStatus).toUpperCase();
      if (!VALID_PAYMENT_STATUSES.includes(paymentStatus as (typeof VALID_PAYMENT_STATUSES)[number])) {
        errors.push('paymentStatus must be UNPAID, PENDING_VERIFICATION, PARTIALLY_PAID, PAID, or REFUNDED.');
      } else {
        updatePayload.paymentStatus = paymentStatus;
      }
    }

    if (body.promo !== undefined) {
      if (body.promo === null || body.promo === '') {
        updatePayload.promo = null;
      } else if (!isValidObjectId(body.promo)) {
        errors.push('promo must be a valid promo ID or null.');
      } else {
        updatePayload.promo = body.promo;
      }
    }

    if (body.specialRequests !== undefined) {
      if (typeof body.specialRequests !== 'string') {
        errors.push('specialRequests must be a string.');
      } else {
        updatePayload.specialRequests = body.specialRequests.trim();
      }
    }

    if (body.guestName !== undefined) {
      const guestName = String(body.guestName || '').trim();
      if (!guestName) {
        errors.push('guestName is required.');
      } else {
        updatePayload.guestName = guestName;
      }
    }

    if (body.email !== undefined) {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email) {
        errors.push('email is required.');
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push('email must be a valid email address.');
      } else {
        updatePayload.email = email;
      }
    }

    if (body.phone !== undefined) {
      const phone = String(body.phone || '').trim();
      if (!phone) {
        errors.push('phone is required.');
      } else {
        updatePayload.phone = phone;
      }
    }

    if (body.address !== undefined) {
      if (body.address === null) {
        updatePayload.address = '';
      } else if (typeof body.address === 'string') {
        updatePayload.address = body.address.trim();
      } else {
        errors.push('address must be a string.');
      }
    }

    if (body.room !== undefined) {
      if (!isValidObjectId(body.room)) {
        errors.push('room must be a valid room ID.');
      } else {
        const roomExists = await Room.findOne({ _id: body.room, isArchived: false }).select('_id').lean();
        if (!roomExists) {
          errors.push('Selected room does not exist.');
        } else {
          updatePayload.room = body.room;
          if (body.roomAssignments === undefined) {
            updatePayload.roomAssignments = [{
              room: body.room,
              adults: Number(existingReservation.adults || 1),
              children: Number(existingReservation.children || 0),
            }];
          }
        }
      }
    }

    if (body.roomAssignments !== undefined) {
      if (!Array.isArray(body.roomAssignments) || body.roomAssignments.length === 0) {
        errors.push('roomAssignments must contain at least one room.');
      } else {
        const roomAssignments = body.roomAssignments.filter((item): item is Record<string, unknown> => isRecord(item))
          .map((item) => ({
            roomId: typeof item.room === 'string' ? item.room.trim() : '',
            adults: Number(item.adults),
            children: Number(item.children),
          }));
        const roomIds = roomAssignments.map((assignment) => assignment.roomId);
        if (roomAssignments.length !== body.roomAssignments.length || new Set(roomIds).size !== roomIds.length) {
          errors.push('roomAssignments must contain unique valid room entries.');
        }
        roomAssignments.forEach((assignment) => {
          if (!isValidObjectId(assignment.roomId)) errors.push('Each room assignment must have a valid room ID.');
          if (!Number.isInteger(assignment.adults) || assignment.adults < 1) errors.push('Each room must have a whole number of at least one adult.');
          if (!Number.isInteger(assignment.children) || assignment.children < 0) errors.push('Children per room must be a non-negative whole number.');
        });
        if (roomAssignments.length === body.roomAssignments.length && roomIds.every(isValidObjectId)) {
          const roomDocs = await Room.find({ _id: { $in: roomIds }, isArchived: false }).select('_id').lean();
          if (roomDocs.length !== roomIds.length) errors.push('One or more selected rooms do not exist.');
          updatePayload.roomAssignments = roomAssignments.map((assignment) => ({
            room: assignment.roomId,
            adults: Math.floor(assignment.adults),
            children: Math.floor(assignment.children),
          }));
          updatePayload.room = roomIds[0];
          updatePayload.adults = roomAssignments.reduce((total, assignment) => total + Math.floor(assignment.adults), 0);
          updatePayload.children = roomAssignments.reduce((total, assignment) => total + Math.floor(assignment.children), 0);
        }
      }
    }

    if (body.checkIn !== undefined) {
      const checkIn = new Date(String(body.checkIn));
      if (Number.isNaN(checkIn.getTime())) {
        errors.push('checkIn must be a valid date.');
      } else {
        updatePayload.checkIn = checkIn;
      }
    }

    if (body.checkOut !== undefined) {
      const checkOut = new Date(String(body.checkOut));
      if (Number.isNaN(checkOut.getTime())) {
        errors.push('checkOut must be a valid date.');
      } else {
        updatePayload.checkOut = checkOut;
      }
    }

    if (body.adults !== undefined && body.roomAssignments === undefined && body.room === undefined && (existingReservation.roomAssignments?.length ?? 0) > 1) {
      errors.push('Per-room guest assignments are required when updating guests for a multi-room reservation.');
    } else if (body.adults !== undefined && body.roomAssignments === undefined) {
      const adults = Number(body.adults);
      if (!Number.isFinite(adults) || adults < 1) {
        errors.push('adults must be a number greater than or equal to 1.');
      } else {
        updatePayload.adults = Math.floor(adults);
      }
    }

    if (body.children !== undefined && body.roomAssignments === undefined && body.room === undefined && (existingReservation.roomAssignments?.length ?? 0) > 1) {
      errors.push('Per-room guest assignments are required when updating guests for a multi-room reservation.');
    } else if (body.children !== undefined && body.roomAssignments === undefined) {
      const children = Number(body.children);
      if (!Number.isFinite(children) || children < 0) {
        errors.push('children must be a number greater than or equal to 0.');
      } else {
        updatePayload.children = Math.floor(children);
      }
    }

    const candidateCheckIn = updatePayload.checkIn instanceof Date ? updatePayload.checkIn : new Date(existingReservation.checkIn);
    const candidateCheckOut = updatePayload.checkOut instanceof Date ? updatePayload.checkOut : new Date(existingReservation.checkOut);

    if (candidateCheckOut <= candidateCheckIn) {
      errors.push('checkOut must be later than checkIn.');
    }

    const existingRoomCheckOuts = new Map(
      (existingReservation.roomCheckOuts || []).map((assignment) => [String(assignment.room), new Date(assignment.checkOut)])
    );
    const existingRoomAssignments = Array.isArray(existingReservation.roomAssignments) && existingReservation.roomAssignments.length > 0
      ? existingReservation.roomAssignments.map((assignment) => ({ roomId: String(assignment.room), adults: Number(assignment.adults), children: Number(assignment.children) }))
      : [{ roomId: String(existingReservation.room), adults: Number(existingReservation.adults), children: Number(existingReservation.children) }];
    const requestedRoomIds = Array.isArray(body.roomAssignments)
      ? body.roomAssignments.filter((item): item is Record<string, unknown> => isRecord(item)).map((assignment) => String(assignment.room || '')).sort()
      : body.room !== undefined
        ? [String(updatePayload.room || body.room)]
        : null;
    const existingRoomIds = existingRoomAssignments.map((assignment) => assignment.roomId).sort();
    const roomSelectionChanged = requestedRoomIds !== null
      && (requestedRoomIds.length !== existingRoomIds.length || requestedRoomIds.some((roomId, index) => roomId !== existingRoomIds[index]));
    const existingCheckOutDay = new Date(existingReservation.checkOut).toISOString().slice(0, 10);
    const candidateCheckOutDay = candidateCheckOut.toISOString().slice(0, 10);
    const resetRoomCheckOuts = roomSelectionChanged || existingCheckOutDay !== candidateCheckOutDay;
    if (body.roomAssignments === undefined && (body.room !== undefined || body.adults !== undefined || body.children !== undefined)) {
      updatePayload.roomAssignments = [{
        room: String(updatePayload.room || existingReservation.room),
        adults: Number(updatePayload.adults ?? existingReservation.adults ?? 1),
        children: Number(updatePayload.children ?? existingReservation.children ?? 0),
      }];
    }
    const candidateRoomAssignmentsBase = Array.isArray(updatePayload.roomAssignments)
      ? (updatePayload.roomAssignments as Array<{ room: string; adults: number; children: number }>).map((assignment) => ({ roomId: assignment.room, adults: assignment.adults, children: assignment.children }))
      : updatePayload.room !== undefined
        ? [{ roomId: String(updatePayload.room), adults: Number(updatePayload.adults ?? existingReservation.adults), children: Number(updatePayload.children ?? existingReservation.children) }]
        : body.adults !== undefined || body.children !== undefined
          ? [{ roomId: String(existingReservation.room), adults: Number(updatePayload.adults ?? existingReservation.adults), children: Number(updatePayload.children ?? existingReservation.children) }]
          : existingRoomAssignments;
    const candidateRoomAssignments = candidateRoomAssignmentsBase.map((assignment) => ({
      ...assignment,
      checkIn: candidateCheckIn,
      checkOut: resetRoomCheckOuts
        ? candidateCheckOut
        : existingRoomCheckOuts.get(assignment.roomId) || candidateCheckOut,
    }));
    const candidateRoomIds = candidateRoomAssignments.map((assignment) => assignment.roomId);
    if (resetRoomCheckOuts || (existingReservation.roomCheckOuts?.length || 0) > 0) {
      updatePayload.roomCheckOuts = candidateRoomAssignments.map((assignment) => ({ room: assignment.roomId, checkOut: assignment.checkOut }));
    }
    const candidateRoomId = candidateRoomIds[0];
    const candidateStatus = String(updatePayload.reservationStatus || existingReservation.reservationStatus).toUpperCase();
    const currentStatus = String(existingReservation.reservationStatus || '').toUpperCase();
    const candidatePromoId = updatePayload.promo === null
      ? null
      : String(updatePayload.promo || existingReservation.promo || '');
    const shouldValidatePromo = body.promo !== undefined
      || body.room !== undefined
      || body.roomAssignments !== undefined
      || body.checkIn !== undefined
      || body.checkOut !== undefined;
    const candidateAddOns = Array.isArray(body.addOns)
      ? body.addOns.filter((item): item is { addOnId: string; quantity: number } => isRecord(item) && typeof item.addOnId === 'string')
          .map((item) => ({ addOnId: item.addOnId, quantity: Number(item.quantity) }))
      : (Array.isArray(existingReservation.addOns)
        ? existingReservation.addOns.map((item) => ({ addOnId: String(item.addOnId), quantity: Number(item.quantity) }))
        : []);

    if (candidateStatus === 'CHECKED_OUT' && currentStatus !== 'CHECKED_OUT') {
      const payments = await Payment.find({ reservation: id })
        .select('amountPaid paymentType paymentStatus paymentMethod')
        .lean();
      const paymentRollup = computeReservationPaymentRollup(
        Number(existingReservation.pricingSummary?.grandTotal || 0),
        payments
      );

      if (paymentRollup.outstandingBalance > 0.01) {
        errors.push(`Cannot check out this reservation while an outstanding balance of ${paymentRollup.outstandingBalance.toFixed(2)} remains.`);
      }
    }

    if (candidateRoomIds.length > 0 && hasValidDateRange({ checkIn: candidateCheckIn, checkOut: candidateCheckOut }) && candidateStatus !== 'CANCELLED' && candidateStatus !== 'CHECKED_OUT') {
      for (const assignment of candidateRoomAssignments) {
        const conflictingReservation = await findConflictingReservation({ roomId: assignment.roomId, checkIn: assignment.checkIn, checkOut: assignment.checkOut, excludeReservationId: id });
        if (conflictingReservation) {
          errors.push(`Date conflict: a selected room is blocked by reservation ${String(conflictingReservation.reservationNumber)}.`);
          break;
        }
      }
    }

    if (candidatePromoId && shouldValidatePromo) {
      const promoEligibility = await validateSelectedPromoEligibility({
        promoId: candidatePromoId,
        roomIds: candidateRoomIds,
        checkIn: candidateCheckIn,
        checkOut: candidateCheckOut,
      });

      if (!promoEligibility.valid) {
        errors.push(promoEligibility.message);
      }
    }

    if (updatePayload.reservationStatus !== undefined && !canTransitionReservationStatus(currentStatus, candidateStatus)) {
      errors.push(`Invalid status transition from ${currentStatus} to ${candidateStatus}.`);
    }

    if (errors.length === 0) {
      if (updatePayload.reservationStatus !== undefined && currentStatus !== candidateStatus) {
        const transitionTimestamp = new Date();
        const existingHistory = Array.isArray(existingReservation.statusHistory)
          ? existingReservation.statusHistory
          : [];

        updatePayload.statusHistory = [
          ...existingHistory,
          {
            fromStatus: currentStatus,
            toStatus: candidateStatus,
            changedAt: transitionTimestamp,
            staffMember: actingStaffMember,
          },
        ];

        if (candidateStatus === 'CHECKED_IN') {
          updatePayload.checkInAt = transitionTimestamp;
          updatePayload.checkedInBy = actingStaffMember;
        }

        if (candidateStatus === 'CHECKED_OUT') {
          updatePayload.checkOutAt = transitionTimestamp;
          updatePayload.checkedOutBy = actingStaffMember;
        }
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ success: false, message: 'Invalid reservation update.', errors }, { status: 400 });
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ success: false, message: 'No update fields were provided.' }, { status: 400 });
    }

    const updated = await withAddOnInventoryLock(candidateAddOns.map((addOn) => addOn.addOnId), async () => {
      const pricingSummary = await calculateReservationPricing({
        roomId: candidateRoomId,
        roomAssignments: candidateRoomAssignments,
        promoId: candidatePromoId,
        checkIn: candidateCheckIn,
        checkOut: candidateCheckOut,
        adults: Number(updatePayload.adults ?? existingReservation.adults),
        children: Number(updatePayload.children ?? existingReservation.children),
        reservationStatus: candidateStatus,
        excludeReservationId: id,
        addOns: candidateAddOns,
      });
      updatePayload.pricingSummary = pricingSummary;
      updatePayload.addOns = pricingSummary.addOns;

      return Reservation.findByIdAndUpdate(id, updatePayload, { new: true })
        .populate('room', 'name code')
        .populate('roomAssignments.room', 'name code description')
        .populate('promo', 'name code inclusions')
        .lean();
    });

    if (!updated) {
      return NextResponse.json({ success: false, message: 'Reservation not found.' }, { status: 404 });
    }

    await writeAuditLog(request, {
      action: candidateStatus !== currentStatus ? `STATUS_${candidateStatus}` : 'UPDATE',
      entityType: 'RESERVATION',
      entityId: id,
      entityLabel: `${updated.reservationNumber} (${updated.guestName})`,
      summary: candidateStatus !== currentStatus
        ? `Changed reservation status from ${currentStatus} to ${candidateStatus}.`
        : 'Updated reservation details.',
      changedFields: diffAuditFields(
        existingReservation,
        updated,
        Object.keys(updatePayload).filter((field) => field !== 'pricingSummary' && field !== 'addOns' && field !== 'statusHistory')
      ),
    });

    await triggerReservationUpdate(id, {
      type: 'reservation-updated',
      reservationStatus: updated.reservationStatus,
      paymentStatus: updated.paymentStatus,
    });

    return NextResponse.json({ success: true, reservation: updated }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof AddOnInventoryBusyError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 409 });
    }
    if (error instanceof AddOnAvailabilityError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: 'Failed to update reservation.' }, { status: 500 });
  }
}
