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
    $or: [{ room: roomId }, { 'roomAssignments.room': roomId }],
    reservationStatus: { $in: BLOCKING_RESERVATION_STATUSES },
  };

  if (excludeReservationId && mongoose.Types.ObjectId.isValid(excludeReservationId)) {
    query._id = { $ne: new mongoose.Types.ObjectId(excludeReservationId) };
  }

  const candidates = await Reservation.find(query)
    .select('_id reservationNumber room roomAssignments.room roomCheckOuts checkIn checkOut reservationStatus')
    .lean();

  return candidates.find((reservation) => {
    const assignedRoomIds = Array.isArray(reservation.roomAssignments) && reservation.roomAssignments.length > 0
      ? reservation.roomAssignments.map((assignment) => String(assignment.room))
      : [String(reservation.room)];
    if (!assignedRoomIds.includes(roomId)) return false;

    const roomCheckOut = reservation.roomCheckOuts?.find((assignment) => String(assignment.room) === roomId)?.checkOut
      || reservation.checkOut;
    return reservation.checkIn < checkOut && roomCheckOut > checkIn;
  }) || null;
}

export async function getRoomAvailabilityLabels(roomIds: string[], referenceDate = new Date()) {
  const labels = new Map<string, RoomAvailabilityLabel>();
  if (roomIds.length === 0) return labels;

  const uniqueRoomIds = Array.from(new Set(roomIds.filter((id) => mongoose.Types.ObjectId.isValid(id))));
  if (uniqueRoomIds.length === 0) return labels;

  const dayStart = toLocalDayStart(referenceDate);
  const nextDayStart = toLocalDayEndExclusive(referenceDate);

  const activeToday = await Reservation.find({
    $or: [{ room: { $in: uniqueRoomIds } }, { 'roomAssignments.room': { $in: uniqueRoomIds } }],
    reservationStatus: { $in: BLOCKING_RESERVATION_STATUSES },
    checkIn: { $lt: nextDayStart },
    checkOut: { $gt: dayStart },
  })
    .select('room roomAssignments.room roomCheckOuts checkIn checkOut')
    .lean();

  const activeTodayRoomSet = new Set(activeToday.flatMap((reservation) => {
    const roomIds = Array.isArray(reservation.roomAssignments) && reservation.roomAssignments.length > 0
      ? reservation.roomAssignments.map((assignment) => String(assignment.room || ''))
      : [String(reservation.room || '')];
    return roomIds.filter((roomId) => {
      const roomCheckOut = reservation.roomCheckOuts?.find((assignment) => String(assignment.room) === roomId)?.checkOut
        || reservation.checkOut;
      return reservation.checkIn < nextDayStart && roomCheckOut > dayStart;
    });
  }).filter(Boolean));

  const upcoming = await Reservation.find({
    $or: [{ room: { $in: uniqueRoomIds } }, { 'roomAssignments.room': { $in: uniqueRoomIds } }],
    reservationStatus: { $in: BLOCKING_RESERVATION_STATUSES },
    checkIn: { $gte: nextDayStart },
  })
    .select('room roomAssignments.room')
    .lean();

  const upcomingRoomSet = new Set(upcoming.flatMap((reservation) => [
    String(reservation.room || ''),
    ...(Array.isArray(reservation.roomAssignments) ? reservation.roomAssignments.map((assignment) => String(assignment.room || '')) : []),
  ]).filter(Boolean));

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
