import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/db';
import RateSettings from '@/app/lib/RateSettings';
import Reservation from '@/app/lib/Reservation';
import { requireOwnerOrStaff } from '@/app/lib/auth';

type PopulatedRoom = {
  _id?: unknown;
  name?: string;
};

type CheckoutReservation = {
  _id: unknown;
  reservationNumber: string;
  guestName: string;
  room?: string | PopulatedRoom | null;
  roomAssignments?: Array<{ room: string | PopulatedRoom }>;
  roomCheckOuts?: Array<{ room: unknown; checkOut: Date | string }>;
  checkOut: Date | string;
};

function toIsoDate(value: Date | string | undefined) {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

export async function GET(request: Request) {
  const authError = requireOwnerOrStaff(request);
  if (authError) return authError;

  try {
    await connectDB();

    const [settings, reservations] = await Promise.all([
      RateSettings.findOne({ key: 'default' }).select('checkOutTime').lean(),
      Reservation.find({ reservationStatus: 'CHECKED_IN' })
        .select('reservationNumber guestName room roomAssignments roomCheckOuts checkOut')
        .populate('room', 'name code')
        .populate('roomAssignments.room', 'name code')
        .sort({ checkOut: 1 })
        .lean(),
    ]);

    const reminders = (reservations as unknown as CheckoutReservation[]).flatMap((reservation) => {
      const checkOutByRoom = new Map(
        (reservation.roomCheckOuts || []).map((item) => [String(item.room), item.checkOut])
      );
      const assignments = reservation.roomAssignments?.length
        ? reservation.roomAssignments
        : reservation.room
          ? [{ room: reservation.room }]
          : [];

      return assignments.flatMap((assignment) => {
        const populatedRoom = typeof assignment.room === 'string' ? null : assignment.room;
        const roomId = populatedRoom ? String(populatedRoom._id || '') : String(assignment.room);
        const checkOut = toIsoDate(checkOutByRoom.get(roomId) || reservation.checkOut);
        if (!roomId || !checkOut) return [];

        return [{
          id: `${String(reservation._id)}:${roomId}:${checkOut}`,
          reservationId: String(reservation._id),
          reservationNumber: reservation.reservationNumber,
          guestName: reservation.guestName,
          roomId,
          roomName: populatedRoom?.name || 'Room',
          checkOut,
        }];
      });
    });

    return NextResponse.json({
      success: true,
      checkOutTime: settings?.checkOutTime || '11:00 AM',
      reminders,
    }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to load room checkout reminders.' }, { status: 500 });
  }
}