import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/db';
import RateSettings from '@/app/lib/RateSettings';
import Reservation from '@/app/lib/Reservation';
import { requireOwnerOrStaff } from '@/app/lib/auth';

type PopulatedRoom = {
  _id?: unknown;
  name?: string;
};

type NoShowReservation = {
  _id: unknown;
  reservationNumber: string;
  guestName: string;
  room?: string | PopulatedRoom | null;
  roomAssignments?: Array<{ room: string | PopulatedRoom }>;
  checkIn: Date | string;
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
      RateSettings.findOne({ key: 'default' }).select('checkInTime').lean(),
      Reservation.find({ reservationStatus: 'CONFIRMED' })
        .select('reservationNumber guestName room roomAssignments checkIn')
        .populate('room', 'name code')
        .populate('roomAssignments.room', 'name code')
        .sort({ checkIn: 1 })
        .lean(),
    ]);

    const reminders = (reservations as unknown as NoShowReservation[]).flatMap((reservation) => {
      const checkIn = toIsoDate(reservation.checkIn);
      if (!checkIn) return [];

      const assignments = reservation.roomAssignments?.length
        ? reservation.roomAssignments
        : reservation.room
          ? [{ room: reservation.room }]
          : [];

      const populatedFirst = assignments.find((assignment) => typeof assignment.room !== 'string');
      const roomName = populatedFirst && typeof populatedFirst.room !== 'string'
        ? populatedFirst.room?.name || 'Room'
        : 'Room';

      return [{
        id: String(reservation._id),
        reservationId: String(reservation._id),
        reservationNumber: reservation.reservationNumber,
        guestName: reservation.guestName,
        roomName,
        checkIn,
      }];
    });

    return NextResponse.json({
      success: true,
      checkInTime: settings?.checkInTime || '1:00 PM',
      reminders,
    }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to load no-show reminders.' }, { status: 500 });
  }
}
