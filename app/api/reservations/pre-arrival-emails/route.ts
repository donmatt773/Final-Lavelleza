import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/db';
import Reservation from '@/app/lib/Reservation';
import { sendPreArrivalEmail } from '@/app/lib/guestEmails';

// Vercel Cron calls this endpoint daily (see vercel.json). It emails guests whose
// confirmed stay starts the next day. CRON_SECRET guards against unauthorized calls.

type PreArrivalReservation = {
  _id: unknown;
  reservationNumber: string;
  guestName: string;
  email?: string;
  checkIn: Date | string;
  checkOut: Date | string;
  adults?: number;
  children?: number;
  specialRequests?: string;
  pricingSummary?: { grandTotal?: number };
  room?: unknown;
  roomAssignments?: Array<{ room?: unknown }>;
};

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
  }

  try {
    await connectDB();

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() + 1);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const reservations = await Reservation.find({
      reservationStatus: 'CONFIRMED',
      preArrivalEmailSentAt: null,
      checkIn: { $gte: dayStart, $lt: dayEnd },
    })
      .select('reservationNumber guestName email checkIn checkOut adults children specialRequests pricingSummary.grandTotal room roomAssignments')
      .populate('room', 'name')
      .populate('roomAssignments.room', 'name')
      .lean();

    let sent = 0;
    const errors: string[] = [];

    for (const reservation of reservations as unknown as PreArrivalReservation[]) {
      try {
        await sendPreArrivalEmail(reservation);
        await Reservation.findByIdAndUpdate(reservation._id, { preArrivalEmailSentAt: new Date() });
        sent += 1;
      } catch (error) {
        errors.push(`${reservation.reservationNumber}: ${error instanceof Error ? error.message : 'send failed'}`);
      }
    }

    return NextResponse.json({ success: true, sent, attempted: reservations.length, errors }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to send pre-arrival emails.' }, { status: 500 });
  }
}
