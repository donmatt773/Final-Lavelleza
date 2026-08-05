import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/db';
import Reservation from '@/app/lib/Reservation';
import Room from '@/app/lib/Room';
import Payment from '@/app/lib/Payment';
import { requireOwnerOrStaff } from '@/app/lib/auth';
import { computeReservationPaymentRollup, normalizeMoney } from '@/app/lib/paymentTracking';

type MostBookedRoom = {
  roomId: string;
  roomName: string;
  roomCode: string;
  reservations: number;
};

type ReservationSourceKey = 'ONLINE' | 'WALK_IN';

type SourceBreakdown = {
  source: ReservationSourceKey;
  reservations: number;
  revenue: number;
};

type PaymentMethodFilter = 'ALL' | 'CASH_ON_ARRIVAL' | 'GCASH';
type PaymentStatusFilter = 'ALL' | 'UNPAID' | 'PENDING_VERIFICATION' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';

function toNumber(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return numeric;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function normalizeSource(value: unknown): ReservationSourceKey {
  return value === 'WALK_IN' ? 'WALK_IN' : 'ONLINE';
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

export async function GET(request: Request) {
  try {
    const authError = requireOwnerOrStaff(request);
    if (authError) return authError;

    await connectDB();
    const { searchParams } = new URL(request.url);

    const selectedDateRaw = searchParams.get('date');
    const paymentMethodFilterRaw = (searchParams.get('paymentMethod') || 'ALL').toUpperCase();
    const paymentStatusFilterRaw = (searchParams.get('paymentStatus') || 'ALL').toUpperCase();

    const selectedDate = parseDateOnlyInput(selectedDateRaw);
    if (selectedDateRaw && !selectedDate) {
      return NextResponse.json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 });
    }

    const paymentMethodFilter: PaymentMethodFilter =
      paymentMethodFilterRaw === 'CASH_ON_ARRIVAL' || paymentMethodFilterRaw === 'GCASH'
        ? paymentMethodFilterRaw
        : 'ALL';

    const paymentStatusFilter: PaymentStatusFilter =
      paymentStatusFilterRaw === 'UNPAID' ||
      paymentStatusFilterRaw === 'PENDING_VERIFICATION' ||
      paymentStatusFilterRaw === 'PARTIALLY_PAID' ||
      paymentStatusFilterRaw === 'PAID' ||
      paymentStatusFilterRaw === 'REFUNDED'
        ? paymentStatusFilterRaw
        : 'ALL';

    const hasPaymentFilters = Boolean(selectedDate || paymentMethodFilter !== 'ALL' || paymentStatusFilter !== 'ALL');

    const now = new Date();
    const referenceDate = selectedDate || startOfLocalDay(now);
    const todayStart = startOfLocalDay(now);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const filterDateStart = startOfLocalDay(referenceDate);
    const filterDateEndExclusive = new Date(filterDateStart);
    filterDateEndExclusive.setDate(filterDateEndExclusive.getDate() + 1);

    const filterMonthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    const filterNextMonthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1);

    const paymentFilterQuery: Record<string, unknown> = {};
    if (selectedDate) {
      paymentFilterQuery.paymentDate = { $gte: filterDateStart, $lt: filterDateEndExclusive };
    }
    if (paymentMethodFilter !== 'ALL') {
      paymentFilterQuery.paymentMethod = paymentMethodFilter;
    }
    if (paymentStatusFilter !== 'ALL') {
      paymentFilterQuery.paymentStatus = paymentStatusFilter;
    }

    const monthlyPaymentFilterQuery: Record<string, unknown> = {
      paymentDate: { $gte: filterMonthStart, $lt: filterNextMonthStart },
    };
    if (paymentMethodFilter !== 'ALL') {
      monthlyPaymentFilterQuery.paymentMethod = paymentMethodFilter;
    }
    if (paymentStatusFilter !== 'ALL') {
      monthlyPaymentFilterQuery.paymentStatus = paymentStatusFilter;
    }

    const [
      pendingReservations,
      confirmedReservations,
      todaysCheckIns,
      todaysCheckOuts,
      totalAvailableRoomInventory,
      occupiedRoomRefs,
      upcomingReservations,
      monthlyReservations,
      monthlyPayments,
      filteredPayments,
      monthlyFilteredPayments,
    ] = await Promise.all([
      Reservation.countDocuments({ reservationStatus: 'PENDING' }),
      Reservation.countDocuments({ reservationStatus: 'CONFIRMED' }),
      Reservation.countDocuments({
        checkIn: { $gte: todayStart, $lt: tomorrowStart },
        reservationStatus: { $in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
      }),
      Reservation.countDocuments({
        checkOut: { $gte: todayStart, $lt: tomorrowStart },
        reservationStatus: { $in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
      }),
      Room.countDocuments({ isArchived: false, status: 'AVAILABLE' }),
      Reservation.find({
        reservationStatus: 'CHECKED_IN',
        checkIn: { $lte: tomorrowStart },
        checkOut: { $gt: todayStart },
      })
        .select('room')
        .lean(),
      Reservation.countDocuments({
        checkIn: { $gte: tomorrowStart },
        reservationStatus: { $in: ['PENDING', 'CONFIRMED'] },
      }),
      Reservation.find({
        checkIn: { $gte: monthStart, $lt: nextMonthStart },
        reservationStatus: { $nin: ['CANCELLED', 'NO_SHOW'] },
      })
        .select('room reservationStatus reservationSource pricingSummary.grandTotal')
        .populate('room', 'name code')
        .lean(),
      Payment.find({ paymentDate: { $gte: monthStart, $lt: nextMonthStart } })
        .select('paymentMethod paymentStatus paymentType amountPaid')
        .lean(),
      Payment.find(paymentFilterQuery)
        .select('reservation paymentMethod paymentStatus paymentType amountPaid paymentDate')
        .lean(),
      Payment.find(monthlyPaymentFilterQuery)
        .select('paymentMethod paymentStatus paymentType amountPaid')
        .lean(),
    ]);

    const occupiedRoomIds = new Set(occupiedRoomRefs.map((reservation) => String(reservation.room || '')));
    const occupiedRooms = occupiedRoomIds.size;
    const availableRooms = Math.max(totalAvailableRoomInventory - occupiedRooms, 0);

    const revenueStatuses = new Set(['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT']);
    let monthlyRevenue = 0;
    let onlineReservations = 0;
    let walkInReservations = 0;
    let onlineRevenue = 0;
    let walkInRevenue = 0;
    let cashPayments = 0;
    let gcashPayments = 0;
    let cashRevenue = 0;
    let gcashRevenue = 0;

    const roomBookingMap = new Map<string, MostBookedRoom>();

    monthlyReservations.forEach((reservation) => {
      const source = normalizeSource((reservation as { reservationSource?: unknown }).reservationSource);
      if (source === 'WALK_IN') {
        walkInReservations += 1;
      } else {
        onlineReservations += 1;
      }

      if (revenueStatuses.has(String(reservation.reservationStatus || '').toUpperCase())) {
        const revenue = toNumber((reservation as { pricingSummary?: { grandTotal?: unknown } }).pricingSummary?.grandTotal);
        monthlyRevenue += revenue;

        if (source === 'WALK_IN') {
          walkInRevenue += revenue;
        } else {
          onlineRevenue += revenue;
        }
      }

      const room = (reservation as { room?: { _id?: unknown; name?: unknown; code?: unknown } | string | null }).room;
      const roomId = typeof room === 'string' ? room : String(room?._id || '');
      if (!roomId) return;

      const roomName = typeof room === 'string' ? 'Unknown Room' : String(room?.name || 'Unknown Room');
      const roomCode = typeof room === 'string' ? 'N/A' : String(room?.code || 'N/A');
      const existing = roomBookingMap.get(roomId);

      if (existing) {
        existing.reservations += 1;
      } else {
        roomBookingMap.set(roomId, {
          roomId,
          roomName,
          roomCode,
          reservations: 1,
        });
      }
    });

    const mostBookedRooms = Array.from(roomBookingMap.values())
      .sort((a, b) => b.reservations - a.reservations || a.roomName.localeCompare(b.roomName))
      .slice(0, 5);

    const sourceBreakdown: SourceBreakdown[] = [
      {
        source: 'ONLINE',
        reservations: onlineReservations,
        revenue: Math.max(0, Math.round(onlineRevenue * 100) / 100),
      },
      {
        source: 'WALK_IN',
        reservations: walkInReservations,
        revenue: Math.max(0, Math.round(walkInRevenue * 100) / 100),
      },
    ];

    monthlyPayments.forEach((payment) => {
      const method = String((payment as { paymentMethod?: unknown }).paymentMethod || '').toUpperCase();
      const status = String((payment as { paymentStatus?: unknown }).paymentStatus || '').toUpperCase();
      const type = String((payment as { paymentType?: unknown }).paymentType || '').toUpperCase();
      const amount = toNumber((payment as { amountPaid?: unknown }).amountPaid);

      if (method === 'CASH_ON_ARRIVAL') {
        cashPayments += 1;
      } else if (method === 'GCASH') {
        gcashPayments += 1;
      }

      if (!['PAID', 'PARTIALLY_PAID', 'REFUNDED'].includes(status)) return;

      const signedAmount = type === 'REFUND' || status === 'REFUNDED' ? -amount : amount;
      if (method === 'CASH_ON_ARRIVAL') {
        cashRevenue += signedAmount;
      } else if (method === 'GCASH') {
        gcashRevenue += signedAmount;
      }
    });

    const filteredReservationIds = Array.from(
      new Set(filteredPayments.map((payment) => String((payment as { reservation?: unknown }).reservation || '')).filter(Boolean))
    );

    const reservationScopeQuery: Record<string, unknown> = {
      reservationStatus: { $nin: ['CANCELLED', 'NO_SHOW'] },
    };

    if (hasPaymentFilters) {
      if (filteredReservationIds.length === 0) {
        reservationScopeQuery._id = { $in: [] };
      } else {
        reservationScopeQuery._id = { $in: filteredReservationIds };
      }
    }

    const scopedReservations = await Reservation.find(reservationScopeQuery)
      .select('pricingSummary.grandTotal paymentStatus')
      .lean();

    const paymentsByReservation = new Map<string, typeof filteredPayments>();
    filteredPayments.forEach((payment) => {
      const reservationId = String((payment as { reservation?: unknown }).reservation || '');
      if (!reservationId) return;
      const existing = paymentsByReservation.get(reservationId);
      if (existing) {
        existing.push(payment);
      } else {
        paymentsByReservation.set(reservationId, [payment]);
      }
    });

    let paidReservations = 0;
    let partiallyPaidReservations = 0;
    let outstandingBalances = 0;

    scopedReservations.forEach((reservation) => {
      const reservationId = String((reservation as { _id?: unknown })._id || '');
      const totalDue = toNumber((reservation as { pricingSummary?: { grandTotal?: unknown } }).pricingSummary?.grandTotal);
      const reservationPayments = paymentsByReservation.get(reservationId) || [];
      const rollup = computeReservationPaymentRollup(totalDue, reservationPayments);

      if (rollup.reservationPaymentStatus === 'PAID') {
        paidReservations += 1;
      } else if (rollup.reservationPaymentStatus === 'PARTIALLY_PAID') {
        partiallyPaidReservations += 1;
      }

      outstandingBalances += toNumber(rollup.outstandingBalance);
    });

    const monthlyRevenueRollup = computeReservationPaymentRollup(0, monthlyFilteredPayments);

    const paymentDashboard = {
      todaysPayments: filteredPayments.length,
      cashPayments: filteredPayments.filter((payment) => String((payment as { paymentMethod?: unknown }).paymentMethod || '').toUpperCase() === 'CASH_ON_ARRIVAL').length,
      gcashPayments: filteredPayments.filter((payment) => String((payment as { paymentMethod?: unknown }).paymentMethod || '').toUpperCase() === 'GCASH').length,
      pendingGcashVerifications: filteredPayments.filter((payment) => {
        const method = String((payment as { paymentMethod?: unknown }).paymentMethod || '').toUpperCase();
        const status = String((payment as { paymentStatus?: unknown }).paymentStatus || '').toUpperCase();
        return method === 'GCASH' && status === 'PENDING_VERIFICATION';
      }).length,
      paidReservations,
      partiallyPaidReservations,
      outstandingBalances: normalizeMoney(outstandingBalances),
      monthlyRevenue: Math.max(0, normalizeMoney(monthlyRevenueRollup.recognizedPaid)),
    };

    return NextResponse.json(
      {
        success: true,
        appliedFilters: {
          date: selectedDate ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}` : null,
          paymentMethod: paymentMethodFilter,
          paymentStatus: paymentStatusFilter,
        },
        dashboard: {
          pendingReservations,
          confirmedReservations,
          todaysCheckIns,
          todaysCheckOuts,
          availableRooms,
          occupiedRooms,
          upcomingReservations,
          monthlyReservationCount: monthlyReservations.length,
          monthlyRevenue: Math.max(0, Math.round(monthlyRevenue * 100) / 100),
          onlineReservations,
          walkInReservations,
          onlineRevenue: Math.max(0, Math.round(onlineRevenue * 100) / 100),
          walkInRevenue: Math.max(0, Math.round(walkInRevenue * 100) / 100),
          cashPayments,
          gcashPayments,
          cashRevenue: Math.round(cashRevenue * 100) / 100,
          gcashRevenue: Math.round(gcashRevenue * 100) / 100,
          paymentDashboard,
          sourceBreakdown,
          mostBookedRooms,
          monthKey: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to load reservation dashboard.' }, { status: 500 });
  }
}
