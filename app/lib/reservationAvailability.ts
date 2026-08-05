import mongoose from 'mongoose';
import Reservation from '@/app/lib/Reservation';

export const BLOCKING_RESERVATION_STATUSES = ['CONFIRMED', 'CHECKED_IN'] as const;

type DateRange = {
  checkIn: Date;
  checkOut: Date;
};

type OverlapQueryInput = {
  roomId: string;
  checkIn: Date;
  checkOut: Date;
  excludeReservationId?: string;
};

export type RoomAvailabilityLabel = 'AVAILABLE' | 'RESERVED_TODAY' | 'UPCOMING_RESERVATION';

function toLocalDayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toLocalDayEndExclusive(date: Date) {
  const dayStart = toLocalDayStart(date);
  const next = new Date(dayStart);
  next.setDate(next.getDate() + 1);
  return next;
}

export function hasValidDateRange(range: DateRange) {
  return !Number.isNaN(range.checkIn.getTime())
    && !Number.isNaN(range.checkOut.getTime())
    && range.checkOut > range.checkIn;
}

export async function findConflictingReservation({ roomId, checkIn, checkOut, excludeReservationId }: OverlapQueryInput) {
  const query: Record<string, unknown> = {
    room: roomId,
    reservationStatus: { $in: BLOCKING_RESERVATION_STATUSES },
    checkIn: { $lt: checkOut },
    checkOut: { $gt: checkIn },
  };

  if (excludeReservationId && mongoose.Types.ObjectId.isValid(excludeReservationId)) {
    query._id = { $ne: new mongoose.Types.ObjectId(excludeReservationId) };
  }

  return Reservation.findOne(query).select('_id reservationNumber checkIn checkOut reservationStatus').lean();
}

export async function getRoomAvailabilityLabels(roomIds: string[], referenceDate = new Date()) {
  const labels = new Map<string, RoomAvailabilityLabel>();
  if (roomIds.length === 0) return labels;

  const uniqueRoomIds = Array.from(new Set(roomIds.filter((id) => mongoose.Types.ObjectId.isValid(id))));
  if (uniqueRoomIds.length === 0) return labels;

  const dayStart = toLocalDayStart(referenceDate);
  const nextDayStart = toLocalDayEndExclusive(referenceDate);

  const activeToday = await Reservation.find({
    room: { $in: uniqueRoomIds },
    reservationStatus: { $in: BLOCKING_RESERVATION_STATUSES },
    checkIn: { $lt: nextDayStart },
    checkOut: { $gt: dayStart },
  })
    .select('room')
    .lean();

  const activeTodayRoomSet = new Set(activeToday.map((reservation) => String(reservation.room)));

  const upcoming = await Reservation.find({
    room: { $in: uniqueRoomIds },
    reservationStatus: { $in: BLOCKING_RESERVATION_STATUSES },
    checkIn: { $gte: nextDayStart },
  })
    .select('room')
    .lean();

  const upcomingRoomSet = new Set(upcoming.map((reservation) => String(reservation.room)));

  uniqueRoomIds.forEach((roomId) => {
    if (activeTodayRoomSet.has(roomId)) {
      labels.set(roomId, 'RESERVED_TODAY');
      return;
    }
    if (upcomingRoomSet.has(roomId)) {
      labels.set(roomId, 'UPCOMING_RESERVATION');
      return;
    }
    labels.set(roomId, 'AVAILABLE');
  });

  return labels;
}
