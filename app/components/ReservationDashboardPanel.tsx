'use client';

import React, { useEffect, useMemo, useState } from 'react';

type MostBookedRoom = {
  roomId: string;
  roomName: string;
  roomCode: string;
  reservations: number;
};

type SourceBreakdownItem = {
  source: 'ONLINE' | 'WALK_IN';
  reservations: number;
  revenue: number;
};

type DashboardMetrics = {
  pendingReservations: number;
  confirmedReservations: number;
  todaysCheckIns: number;
  todaysCheckOuts: number;
  availableRooms: number;
  occupiedRooms: number;
  upcomingReservations: number;
  monthlyReservationCount: number;
  monthlyRevenue: number;
  onlineReservations: number;
  walkInReservations: number;
  onlineRevenue: number;
  walkInRevenue: number;
  cashPayments: number;
  gcashPayments: number;
  cashRevenue: number;
  gcashRevenue: number;
  paymentDashboard: {
    todaysPayments: number;
    cashPayments: number;
    gcashPayments: number;
    pendingGcashVerifications: number;
    paidReservations: number;
    partiallyPaidReservations: number;
    outstandingBalances: number;
    monthlyRevenue: number;
  };
  sourceBreakdown: SourceBreakdownItem[];
  mostBookedRooms: MostBookedRoom[];
  monthKey: string;
};

const emptyMetrics: DashboardMetrics = {
  pendingReservations: 0,
  confirmedReservations: 0,
  todaysCheckIns: 0,
  todaysCheckOuts: 0,
  availableRooms: 0,
  occupiedRooms: 0,
  upcomingReservations: 0,
  monthlyReservationCount: 0,
  monthlyRevenue: 0,
  onlineReservations: 0,
  walkInReservations: 0,
  onlineRevenue: 0,
  walkInRevenue: 0,
  cashPayments: 0,
  gcashPayments: 0,
  cashRevenue: 0,
  gcashRevenue: 0,
  paymentDashboard: {
    todaysPayments: 0,
    cashPayments: 0,
    gcashPayments: 0,
    pendingGcashVerifications: 0,
    paidReservations: 0,
    partiallyPaidReservations: 0,
    outstandingBalances: 0,
    monthlyRevenue: 0,
  },
  sourceBreakdown: [],
  mostBookedRooms: [],
  monthKey: '',
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

const formatMonthLabel = (monthKey: string) => {
  const [yearRaw, monthRaw] = monthKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return 'Current Month';
  }

  return new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
};

export default function ReservationDashboardPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics);
  const [dateFilter, setDateFilter] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<'ALL' | 'CASH_ON_ARRIVAL' | 'GCASH'>('ALL');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'ALL' | 'UNPAID' | 'PENDING_VERIFICATION' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED'>('ALL');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (dateFilter) params.set('date', dateFilter);
        if (paymentMethodFilter !== 'ALL') params.set('paymentMethod', paymentMethodFilter);
        if (paymentStatusFilter !== 'ALL') params.set('paymentStatus', paymentStatusFilter);

        const response = await fetch(`/api/reservations/dashboard${params.toString() ? `?${params.toString()}` : ''}`, { credentials: 'same-origin' });
        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.success) {
          throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to load reservation dashboard.');
        }

        if (!cancelled) {
          setMetrics({
            pendingReservations: Number(data?.dashboard?.pendingReservations || 0),
            confirmedReservations: Number(data?.dashboard?.confirmedReservations || 0),
            todaysCheckIns: Number(data?.dashboard?.todaysCheckIns || 0),
            todaysCheckOuts: Number(data?.dashboard?.todaysCheckOuts || 0),
            availableRooms: Number(data?.dashboard?.availableRooms || 0),
            occupiedRooms: Number(data?.dashboard?.occupiedRooms || 0),
            upcomingReservations: Number(data?.dashboard?.upcomingReservations || 0),
            monthlyReservationCount: Number(data?.dashboard?.monthlyReservationCount || 0),
            monthlyRevenue: Number(data?.dashboard?.monthlyRevenue || 0),
            onlineReservations: Number(data?.dashboard?.onlineReservations || 0),
            walkInReservations: Number(data?.dashboard?.walkInReservations || 0),
            onlineRevenue: Number(data?.dashboard?.onlineRevenue || 0),
            walkInRevenue: Number(data?.dashboard?.walkInRevenue || 0),
            cashPayments: Number(data?.dashboard?.cashPayments || 0),
            gcashPayments: Number(data?.dashboard?.gcashPayments || 0),
            cashRevenue: Number(data?.dashboard?.cashRevenue || 0),
            gcashRevenue: Number(data?.dashboard?.gcashRevenue || 0),
            paymentDashboard: {
              todaysPayments: Number(data?.dashboard?.paymentDashboard?.todaysPayments || 0),
              cashPayments: Number(data?.dashboard?.paymentDashboard?.cashPayments || 0),
              gcashPayments: Number(data?.dashboard?.paymentDashboard?.gcashPayments || 0),
              pendingGcashVerifications: Number(data?.dashboard?.paymentDashboard?.pendingGcashVerifications || 0),
              paidReservations: Number(data?.dashboard?.paymentDashboard?.paidReservations || 0),
              partiallyPaidReservations: Number(data?.dashboard?.paymentDashboard?.partiallyPaidReservations || 0),
              outstandingBalances: Number(data?.dashboard?.paymentDashboard?.outstandingBalances || 0),
              monthlyRevenue: Number(data?.dashboard?.paymentDashboard?.monthlyRevenue || 0),
            },
            sourceBreakdown: Array.isArray(data?.dashboard?.sourceBreakdown) ? data.dashboard.sourceBreakdown : [],
            mostBookedRooms: Array.isArray(data?.dashboard?.mostBookedRooms) ? data.dashboard.mostBookedRooms : [],
            monthKey: String(data?.dashboard?.monthKey || ''),
          });
        }
      } catch (loadError) {
        if (!cancelled) {
          setMetrics(emptyMetrics);
          setError(loadError instanceof Error ? loadError.message : 'Unable to load reservation dashboard.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [dateFilter, paymentMethodFilter, paymentStatusFilter]);

  const monthLabel = useMemo(() => formatMonthLabel(metrics.monthKey), [metrics.monthKey]);

  return (
    <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-slate-300">
      <div className="mb-5 flex flex-col gap-2 border-b border-slate-800 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Reservation Dashboard</h2>
          <p className="text-sm text-slate-400">Live reservation metrics from the current system module.</p>
        </div>
        <p className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
          Period: {monthLabel}
        </p>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Date</label>
          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Payment Method</label>
          <select
            value={paymentMethodFilter}
            onChange={(event) => {
              const value = event.target.value;
              if (value === 'CASH_ON_ARRIVAL' || value === 'GCASH' || value === 'ALL') {
                setPaymentMethodFilter(value);
              }
            }}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Methods</option>
            <option value="CASH_ON_ARRIVAL">Cash on Arrival</option>
            <option value="GCASH">GCash</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Payment Status</label>
          <select
            value={paymentStatusFilter}
            onChange={(event) => {
              const value = event.target.value;
              if (value === 'ALL' || value === 'UNPAID' || value === 'PENDING_VERIFICATION' || value === 'PARTIALLY_PAID' || value === 'PAID' || value === 'REFUNDED') {
                setPaymentStatusFilter(value);
              }
            }}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PENDING_VERIFICATION">Pending Verification</option>
            <option value="PARTIALLY_PAID">Partially Paid</option>
            <option value="PAID">Paid</option>
            <option value="REFUNDED">Refunded</option>
          </select>
        </div>
        <div className="md:col-span-3 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setDateFilter('');
              setPaymentMethodFilter('ALL');
              setPaymentStatusFilter('ALL');
            }}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">Loading reservation metrics...</div>
      ) : (
        <>
          <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Payment Dashboard</p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">Today&apos;s Payments</p>
                <p className="mt-2 text-2xl font-semibold text-white">{metrics.paymentDashboard.todaysPayments}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">Cash Payments</p>
                <p className="mt-2 text-2xl font-semibold text-orange-300">{metrics.paymentDashboard.cashPayments}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">GCash Payments</p>
                <p className="mt-2 text-2xl font-semibold text-cyan-300">{metrics.paymentDashboard.gcashPayments}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">Pending GCash Verifications</p>
                <p className="mt-2 text-2xl font-semibold text-sky-300">{metrics.paymentDashboard.pendingGcashVerifications}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">Paid Reservations</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-300">{metrics.paymentDashboard.paidReservations}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">Partially Paid Reservations</p>
                <p className="mt-2 text-2xl font-semibold text-amber-300">{metrics.paymentDashboard.partiallyPaidReservations}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">Outstanding Balances</p>
                <p className="mt-2 text-2xl font-semibold text-rose-300">{formatCurrency(metrics.paymentDashboard.outstandingBalances)}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">Monthly Revenue</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-300">{formatCurrency(metrics.paymentDashboard.monthlyRevenue)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Pending Reservations</p>
              <p className="mt-2 text-2xl font-semibold text-white">{metrics.pendingReservations}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Confirmed Reservations</p>
              <p className="mt-2 text-2xl font-semibold text-white">{metrics.confirmedReservations}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Today&apos;s Check-ins</p>
              <p className="mt-2 text-2xl font-semibold text-white">{metrics.todaysCheckIns}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Today&apos;s Check-outs</p>
              <p className="mt-2 text-2xl font-semibold text-white">{metrics.todaysCheckOuts}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Available Rooms</p>
              <p className="mt-2 text-2xl font-semibold text-white">{metrics.availableRooms}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Occupied Rooms</p>
              <p className="mt-2 text-2xl font-semibold text-white">{metrics.occupiedRooms}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Upcoming Reservations</p>
              <p className="mt-2 text-2xl font-semibold text-white">{metrics.upcomingReservations}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Monthly Reservation Count</p>
              <p className="mt-2 text-2xl font-semibold text-white">{metrics.monthlyReservationCount}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Monthly Revenue</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-300">{formatCurrency(metrics.monthlyRevenue)}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Online Reservations</p>
              <p className="mt-2 text-2xl font-semibold text-sky-300">{metrics.onlineReservations}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Walk-In Reservations</p>
              <p className="mt-2 text-2xl font-semibold text-amber-300">{metrics.walkInReservations}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Online Revenue</p>
              <p className="mt-2 text-2xl font-semibold text-sky-300">{formatCurrency(metrics.onlineRevenue)}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Walk-In Revenue</p>
              <p className="mt-2 text-2xl font-semibold text-amber-300">{formatCurrency(metrics.walkInRevenue)}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Cash Payments</p>
              <p className="mt-2 text-2xl font-semibold text-orange-300">{metrics.cashPayments}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">GCash Payments</p>
              <p className="mt-2 text-2xl font-semibold text-cyan-300">{metrics.gcashPayments}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Cash Revenue</p>
              <p className="mt-2 text-2xl font-semibold text-orange-300">{formatCurrency(metrics.cashRevenue)}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">GCash Revenue</p>
              <p className="mt-2 text-2xl font-semibold text-cyan-300">{formatCurrency(metrics.gcashRevenue)}</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Reservation Source Breakdown</p>
            {metrics.sourceBreakdown.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No source data available for this period.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm text-slate-300">
                  <thead className="text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Source</th>
                      <th className="py-2 pr-3">Reservations</th>
                      <th className="py-2 pr-3">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {metrics.sourceBreakdown.map((item) => (
                      <tr key={item.source}>
                        <td className="py-2 pr-3">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.source === 'WALK_IN' ? 'bg-amber-500/10 text-amber-300' : 'bg-sky-500/10 text-sky-300'}`}>
                            {item.source}
                          </span>
                        </td>
                        <td className="py-2 pr-3">{item.reservations}</td>
                        <td className="py-2 pr-3 text-emerald-300">{formatCurrency(item.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Most Booked Rooms</p>
            {metrics.mostBookedRooms.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No room booking records for this period.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm text-slate-300">
                  <thead className="text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Room</th>
                      <th className="py-2 pr-3">Code</th>
                      <th className="py-2 pr-3">Reservations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {metrics.mostBookedRooms.map((room) => (
                      <tr key={room.roomId}>
                        <td className="py-2 pr-3 text-white">{room.roomName}</td>
                        <td className="py-2 pr-3">{room.roomCode}</td>
                        <td className="py-2 pr-3">{room.reservations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
