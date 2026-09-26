import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/app/lib/db';
import Reservation from '@/app/lib/Reservation';
import { requireOwnerOrStaff } from '@/app/lib/auth';
import { findConflictingReservation } from '@/app/lib/reservationAvailability';
import { calculateReservationPricing } from '@/app/lib/reservationPricing';
import { triggerReservationUpdate } from '@/app/lib/pusher-server';
import { diffAuditFields, writeAuditLog } from '@/app/lib/auditLogWriter';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nightsBetween(checkIn: Date, checkOut: Date) {
  const start = Date.UTC(checkIn.getUTCFullYear(), checkIn.getUTCMonth(), checkIn.getUTCDate());
  const end = Date.UTC(checkOut.getUTCFullYear(), checkOut.getUTCMonth(), checkOut.getUTCDate());
  return Math.max(1, Math.ceil((end - start) / 86_400_000));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = requireOwnerOrStaff(request);
  if (authError) return authError;

  try {
    await connectDB();
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid reservation ID.' }, { status: 400 });
    }

    const reservation = await Reservation.findById(id).lean();
    if (!reservation) return NextResponse.json({ success: false, message: 'Reservation not found.' }, { status: 404 });
    if (['CANCELLED', 'CHECKED_OUT', 'NO_SHOW'].includes(String(reservation.reservationStatus))) {
      return NextResponse.json({ success: false, message: 'This reservation cannot be extended in its current status.' }, { status: 409 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body.' }, { status: 400 });
    }
    if (!isRecord(body)) return NextResponse.json({ success: false, message: 'Request body must be a JSON object.' }, { status: 400 });

    const newCheckOut = typeof body.checkOut === 'string' ? new Date(body.checkOut) : new Date('invalid');
    if (Number.isNaN(newCheckOut.getTime())) {
      return NextResponse.json({ success: false, message: 'A valid new check-out date is required.' }, { status: 400 });
    }

    const roomAssignments = Array.isArray(reservation.roomAssignments) && reservation.roomAssignments.length > 0
      ? reservation.roomAssignments.map((assignment) => ({
          roomId: String(assignment.room),
          adults: Number(assignment.adults || 1),
          children: Number(assignment.children || 0),
        }))
      : [{ roomId: String(reservation.room), adults: Number(reservation.adults || 1), children: Number(reservation.children || 0) }];
    const requestedRoomIds = Array.isArray(body.roomIds)
      ? body.roomIds.filter((roomId): roomId is string => typeof roomId === 'string')
      : [];
    const validRoomIds = new Set(roomAssignments.map((assignment) => assignment.roomId));
    if (requestedRoomIds.length === 0
      || new Set(requestedRoomIds).size !== requestedRoomIds.length
      || requestedRoomIds.some((roomId) => !validRoomIds.has(roomId))) {
      return NextResponse.json({ success: false, message: 'Select one or more rooms from this reservation.' }, { status: 400 });
    }

    const existingRoomCheckOuts = new Map(
      (reservation.roomCheckOuts || []).map((item) => [String(item.room), new Date(item.checkOut)])
    );
    const baseCheckOut = new Date(reservation.checkOut);
    const roomCheckOuts = roomAssignments.map((assignment) => ({
      room: assignment.roomId,
      checkOut: existingRoomCheckOuts.get(assignment.roomId) || baseCheckOut,
    }));
    const selectedAssignments = roomAssignments.filter((assignment) => requestedRoomIds.includes(assignment.roomId));

    for (const assignment of selectedAssignments) {
      const currentCheckOut = existingRoomCheckOuts.get(assignment.roomId) || baseCheckOut;
      if (newCheckOut <= currentCheckOut) {
        return NextResponse.json({
          success: false,
          message: `New check-out must be after the current check-out for ${assignment.roomId === String(reservation.room) ? 'the selected room' : 'every selected room'}.`,
        }, { status: 400 });
      }
      const conflict = await findConflictingReservation({
        roomId: assignment.roomId,
        checkIn: currentCheckOut,
        checkOut: newCheckOut,
        excludeReservationId: id,
      });
      if (conflict) {
        return NextResponse.json({
          success: false,
          message: `Room extension conflicts with reservation ${String(conflict.reservationNumber)}.`,
        }, { status: 409 });
      }
    }

    const extensionPricing = await Promise.all(selectedAssignments.map((assignment) => {
      const currentCheckOut = existingRoomCheckOuts.get(assignment.roomId) || baseCheckOut;
      return calculateReservationPricing({
        roomId: assignment.roomId,
        roomAssignments: [{ ...assignment }],
        checkIn: currentCheckOut,
        checkOut: newCheckOut,
        adults: assignment.adults,
        children: assignment.children,
        reservationStatus: String(reservation.reservationStatus),
        excludeReservationId: id,
        addOns: [],
      });
    }));

    const addedRoomRate = extensionPricing.reduce((total, pricing) => total + pricing.roomRate, 0);
    const addedExtraPersonFee = extensionPricing.reduce((total, pricing) => total + pricing.extraPersonFee, 0);
    const addedTotal = extensionPricing.reduce((total, pricing) => total + pricing.grandTotal, 0);
    const pricingSummary = reservation.pricingSummary || {
      currency: 'PHP' as const,
      roomRate: 0,
      numberOfNights: 1,
      extraPersonFee: 0,
      extraBedFee: 0,
      addOns: [],
      promoDiscount: 0,
      additionalRoomDiscount: 0,
      subtotal: 0,
      grandTotal: 0,
    };
    const existingBreakdown = Array.isArray(pricingSummary.roomBreakdown) ? [...pricingSummary.roomBreakdown] : [];
    extensionPricing.forEach((pricing) => {
      const extensionRoom = pricing.roomBreakdown[0];
      const index = existingBreakdown.findIndex((room) => String(room.roomId) === extensionRoom.roomId);
      if (index >= 0) {
        existingBreakdown[index] = {
          ...existingBreakdown[index],
          roomRate: Number(existingBreakdown[index].roomRate || 0) + extensionRoom.roomRate,
          extraPersonFee: Number(existingBreakdown[index].extraPersonFee || 0) + extensionRoom.extraPersonFee,
        };
      } else {
        existingBreakdown.push(extensionRoom);
      }
    });

    const updatedRoomCheckOuts = roomCheckOuts.map((assignment) => ({
      room: assignment.room,
      checkOut: requestedRoomIds.includes(assignment.room)
        ? newCheckOut
        : assignment.checkOut,
    }));
    const latestCheckOut = updatedRoomCheckOuts.reduce(
      (latest, assignment) => assignment.checkOut > latest ? assignment.checkOut : latest,
      new Date(reservation.checkOut)
    );
    const updatedPricingSummary = {
      ...pricingSummary,
      roomRate: Number(pricingSummary.roomRate || 0) + addedRoomRate,
      numberOfNights: nightsBetween(new Date(reservation.checkIn), latestCheckOut),
      extraPersonFee: Number(pricingSummary.extraPersonFee || 0) + addedExtraPersonFee,
      subtotal: Number(pricingSummary.subtotal || 0) + addedTotal,
      grandTotal: Number(pricingSummary.grandTotal || 0) + addedTotal,
      roomBreakdown: existingBreakdown,
    };

    if (body.preview === true) {
      return NextResponse.json({
        success: true,
        extension: {
          roomIds: requestedRoomIds,
          addedAmount: addedTotal,
          newGrandTotal: updatedPricingSummary.grandTotal,
          roomCheckOuts: roomCheckOuts.map((assignment) => ({
            room: assignment.room,
            checkOut: requestedRoomIds.includes(assignment.room) ? newCheckOut : assignment.checkOut,
          })),
        },
      }, { status: 200 });
    }

    const updated = await Reservation.findByIdAndUpdate(id, {
      $set: {
        checkOut: latestCheckOut,
        roomCheckOuts: updatedRoomCheckOuts,
        pricingSummary: updatedPricingSummary,
      },
    }, { new: true }).lean();
    if (!updated) return NextResponse.json({ success: false, message: 'Reservation could not be updated.' }, { status: 404 });

    await writeAuditLog(request, {
      action: 'EXTEND_STAY',
      entityType: 'RESERVATION',
      entityId: id,
      entityLabel: `${updated.reservationNumber} (${updated.guestName})`,
      summary: `Extended ${requestedRoomIds.length === roomAssignments.length ? 'all rooms' : `${requestedRoomIds.length} room(s)`} through ${newCheckOut.toISOString().slice(0, 10)}.`,
      changedFields: diffAuditFields(reservation, updated, ['checkOut', 'roomCheckOuts', 'pricingSummary']),
    });
    await triggerReservationUpdate(id, {
      type: 'reservation-updated',
      reservationStatus: updated.reservationStatus,
      paymentStatus: updated.paymentStatus,
    });

    return NextResponse.json({
      success: true,
      reservation: updated,
      extension: { roomIds: requestedRoomIds, addedAmount: addedTotal },
    }, { status: 200 });
  } catch (error) {
    console.error('RESERVATION EXTENSION ERROR:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unable to extend reservation.',
    }, { status: 500 });
  }
}