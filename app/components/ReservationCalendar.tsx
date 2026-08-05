'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW' | 'CHECKED_IN' | 'CHECKED_OUT';

type ReservationRecord = {
  _id: string;
  reservationNumber: string;
  guestName: string;
  email: string;
  phone: string;
  room?: { _id?: string; name?: string; code?: string } | null;
  promo?: { _id?: string; name?: string; code?: string } | null;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  specialRequests?: string;
  reservationStatus: ReservationStatus;
  paymentStatus: 'UNPAID' | 'PENDING_VERIFICATION' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-300 border-amber-600/40',
  CONFIRMED: 'bg-emerald-500/15 text-emerald-300 border-emerald-600/40',
  CHECKED_IN: 'bg-blue-500/15 text-blue-300 border-blue-600/40',
  CHECKED_OUT: 'bg-slate-500/15 text-slate-300 border-slate-600/40',
  CANCELLED: 'bg-rose-500/15 text-rose-300 border-rose-600/40',
  NO_SHOW: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-600/40',
};

function toMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  const result = startOfDay(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function getDaysGrid(monthDate: Date) {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const startOffset = start.getDay();
  const totalDays = end.getDate();

  const cells: Date[] = [];

  for (let i = 0; i < startOffset; i += 1) {
    const d = new Date(start);
    d.setDate(d.getDate() - (startOffset - i));
    cells.push(d);
  }

  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }

  while (cells.length % 7 !== 0) {
    const d = new Date(cells[cells.length - 1]);
    d.setDate(d.getDate() + 1);
    cells.push(d);
  }

  return cells;
}

export default function ReservationCalendar() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [selectedReservation, setSelectedReservation] = useState<ReservationRecord | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const month = toMonthKey(currentMonth);
        const response = await fetch(`/api/reservations?month=${month}`, { credentials: 'same-origin' });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to load calendar reservations.');
        }
        setReservations(Array.isArray(data) ? data : []);
      } catch (loadError) {
        setReservations([]);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load calendar reservations.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [currentMonth]);

  const days = useMemo(() => getDaysGrid(currentMonth), [currentMonth]);

  const getReservationsForDate = useCallback((date: Date) => {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    return reservations.filter((reservation) => {
      const checkIn = new Date(reservation.checkIn);
      const checkOut = new Date(reservation.checkOut);
      if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) return false;
      return checkIn <= dayEnd && checkOut >= dayStart;
    });
  }, [reservations]);

  const selectedDateReservations = useMemo(() => getReservationsForDate(selectedDate), [selectedDate, getReservationsForDate]);

  const occupancyByRoom = useMemo(() => {
    const map = new Map<string, { roomName: string; count: number }>();
    selectedDateReservations.forEach((reservation) => {
      const roomName = reservation.room?.name || 'Unknown Room';
      const existing = map.get(roomName);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(roomName, { roomName, count: 1 });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.roomName.localeCompare(b.roomName));
  }, [selectedDateReservations]);

  const monthTitle = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(currentMonth);

  return (
    <section className="mt-4 rounded-3xl border border-slate-800 bg-linear-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/30">
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-800 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">Reservation Calendar</p>
          <h2 className="text-2xl font-semibold text-white">Monthly reservation schedule</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Prev
          </button>
          <p className="min-w-44 text-center text-sm font-semibold text-white">{monthTitle}</p>
          <button
            type="button"
            onClick={() => setCurrentMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Next
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">Loading calendar...</div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {days.map((day) => {
              const dayReservations = getReservationsForDate(day);
              const inMonth = day.getMonth() === currentMonth.getMonth();
              const isSelected = day.toDateString() === selectedDate.toDateString();

              const statusCounts = {
                PENDING: dayReservations.filter((item) => item.reservationStatus === 'PENDING').length,
                CONFIRMED: dayReservations.filter((item) => item.reservationStatus === 'CONFIRMED').length,
                CHECKED_IN: dayReservations.filter((item) => item.reservationStatus === 'CHECKED_IN').length,
                CHECKED_OUT: dayReservations.filter((item) => item.reservationStatus === 'CHECKED_OUT').length,
                CANCELLED: dayReservations.filter((item) => item.reservationStatus === 'CANCELLED').length,
              };

              return (
                <button
                  type="button"
                  key={`${day.toISOString()}-${inMonth ? 'in' : 'out'}`}
                  onClick={() => setSelectedDate(day)}
                  className={`min-h-28 rounded-xl border p-2 text-left transition ${isSelected ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/70 hover:bg-slate-900'} ${inMonth ? 'text-white' : 'text-slate-600'}`}
                >
                  <p className="text-xs font-semibold">{day.getDate()}</p>
                  <div className="mt-1 space-y-1 text-[10px]">
                    {Object.entries(statusCounts).map(([status, count]) => (
                      count > 0 ? (
                        <div key={status} className={`rounded border px-1 py-0.5 ${STATUS_STYLES[status]}`}>
                          {status.replace('_', ' ')}: {count}
                        </div>
                      ) : null
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <h3 className="text-sm font-semibold text-white">Reservations on {formatDate(selectedDate.toISOString())}</h3>
              {selectedDateReservations.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">No reservations for this date.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {selectedDateReservations.map((reservation) => (
                    <button
                      key={reservation._id}
                      type="button"
                      onClick={() => setSelectedReservation(reservation)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                    >
                      <p className="font-semibold text-white">{reservation.reservationNumber} - {reservation.guestName}</p>
                      <p className="text-xs text-slate-400">{reservation.room?.name || 'Unknown Room'} | {reservation.reservationStatus.replace('_', ' ')}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <h3 className="text-sm font-semibold text-white">Occupancy by Room</h3>
              {occupancyByRoom.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">No occupied rooms for this date.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {occupancyByRoom.map((entry) => (
                    <div key={entry.roomName} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
                      <p className="font-medium text-white">{entry.roomName}</p>
                      <p className="text-xs text-slate-400">{entry.count} active reservation{entry.count === 1 ? '' : 's'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {selectedReservation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Reservation Details</h3>
              <button
                type="button"
                onClick={() => setSelectedReservation(null)}
                className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="grid gap-2 text-sm text-slate-300">
              <p><span className="text-slate-500">Reservation No:</span> {selectedReservation.reservationNumber}</p>
              <p><span className="text-slate-500">Guest:</span> {selectedReservation.guestName}</p>
              <p><span className="text-slate-500">Email:</span> {selectedReservation.email}</p>
              <p><span className="text-slate-500">Phone:</span> {selectedReservation.phone}</p>
              <p><span className="text-slate-500">Room:</span> {selectedReservation.room?.name || '—'}</p>
              <p><span className="text-slate-500">Promo:</span> {selectedReservation.promo?.name || '—'}</p>
              <p><span className="text-slate-500">Check In:</span> {formatDate(selectedReservation.checkIn)}</p>
              <p><span className="text-slate-500">Check Out:</span> {formatDate(selectedReservation.checkOut)}</p>
              <p><span className="text-slate-500">Status:</span> {selectedReservation.reservationStatus.replace('_', ' ')}</p>
              <p><span className="text-slate-500">Adults:</span> {selectedReservation.adults} | <span className="text-slate-500">Children:</span> {selectedReservation.children}</p>
              <p><span className="text-slate-500">Special Requests:</span> {selectedReservation.specialRequests || '—'}</p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
