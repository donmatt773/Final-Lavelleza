'use client';

import React, { useEffect, useMemo, useState } from 'react';

type PaymentByDateItem = {
  date: string;
  payments: number;
  amount: number;
  refundAmount: number;
  netAmount: number;
};

type PaymentMethodBreakdownItem = {
  method: string;
  payments: number;
  amount: number;
  netRevenue: number;
};

type PaymentRow = {
  paymentNumber: string;
  paymentDate: string;
  reservationNumber: string;
  guestName: string;
  paymentMethod: string;
  paymentStatus: string;
  paymentType: string;
  amountPaid: number;
  referenceNumber: string;
};

type PaymentReport = {
  paymentsByDate: PaymentByDateItem[];
  cashRevenue: number;
  gcashRevenue: number;
  outstandingBalances: number;
  refundSummary: {
    refundTransactions: number;
    refundAmount: number;
  };
  paymentMethodBreakdown: PaymentMethodBreakdownItem[];
  payments: PaymentRow[];
  totals: {
    totalPayments: number;
    totalReservations: number;
  };
};

type Props = {
  active: boolean;
};

const emptyReport: PaymentReport = {
  paymentsByDate: [],
  cashRevenue: 0,
  gcashRevenue: 0,
  outstandingBalances: 0,
  refundSummary: {
    refundTransactions: 0,
    refundAmount: 0,
  },
  paymentMethodBreakdown: [],
  payments: [],
  totals: {
    totalPayments: 0,
    totalReservations: 0,
  },
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

export default function PaymentReportsPanel({ active }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<PaymentReport>(emptyReport);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'ALL' | 'CASH_ON_ARRIVAL' | 'GCASH'>('ALL');
  const [paymentStatus, setPaymentStatus] = useState<'ALL' | 'UNPAID' | 'PENDING_VERIFICATION' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED'>('ALL');
  const [reservationNumber, setReservationNumber] = useState('');
  const [guestName, setGuestName] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (paymentMethod !== 'ALL') params.set('paymentMethod', paymentMethod);
    if (paymentStatus !== 'ALL') params.set('paymentStatus', paymentStatus);
    if (reservationNumber.trim()) params.set('reservationNumber', reservationNumber.trim());
    if (guestName.trim()) params.set('guestName', guestName.trim());
    return params.toString();
  }, [startDate, endDate, paymentMethod, paymentStatus, reservationNumber, guestName]);

  const loadReport = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/reservations/reports/payments${queryString ? `?${queryString}` : ''}`, {
        credentials: 'same-origin',
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to load payment report.');
      }

      setReport(data.report || emptyReport);
    } catch (loadError) {
      setReport(emptyReport);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load payment report.');
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    if (!active) return;
    void loadReport();
  }, [active, loadReport]);

  const exportReport = async (format: 'CSV' | 'PDF' | 'EXCEL') => {
    try {
      const params = new URLSearchParams(queryString);
      params.set('export', format);

      const response = await fetch(`/api/reservations/reports/payments?${params.toString()}`, {
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(typeof data?.message === 'string' ? data.message : `Unable to export ${format}.`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `payment-report-${Date.now()}.${format === 'CSV' ? 'csv' : format === 'PDF' ? 'pdf' : 'xls'}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : `Unable to export ${format}.`);
    }
  };

  if (!active) return null;

  return (
    <section className="mt-4 rounded-3xl border border-slate-800 bg-linear-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/30">
      <div className="mb-6 border-b border-slate-800 pb-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">Payment Reports</p>
            <h2 className="text-2xl font-semibold text-white">Generate payment analytics and exports</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { void exportReport('PDF'); }}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
            >
              Export PDF
            </button>
            <button
              type="button"
              onClick={() => { void exportReport('EXCEL'); }}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
            >
              Export Excel
            </button>
            <button
              type="button"
              onClick={() => { void exportReport('CSV'); }}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</div>
      ) : null}

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <input
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          aria-label="Start date"
        />
        <input
          type="date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          aria-label="End date"
        />
        <select
          value={paymentMethod}
          onChange={(event) => {
            const value = event.target.value;
            if (value === 'ALL' || value === 'CASH_ON_ARRIVAL' || value === 'GCASH') {
              setPaymentMethod(value);
            }
          }}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
        >
          <option value="ALL">All Payment Methods</option>
          <option value="CASH_ON_ARRIVAL">Cash on Arrival</option>
          <option value="GCASH">GCash</option>
        </select>
        <select
          value={paymentStatus}
          onChange={(event) => {
            const value = event.target.value;
            if (value === 'ALL' || value === 'UNPAID' || value === 'PENDING_VERIFICATION' || value === 'PARTIALLY_PAID' || value === 'PAID' || value === 'REFUNDED') {
              setPaymentStatus(value);
            }
          }}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
        >
          <option value="ALL">All Payment Statuses</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PENDING_VERIFICATION">Pending Verification</option>
          <option value="PARTIALLY_PAID">Partially Paid</option>
          <option value="PAID">Paid</option>
          <option value="REFUNDED">Refunded</option>
        </select>
        <input
          value={reservationNumber}
          onChange={(event) => setReservationNumber(event.target.value)}
          placeholder="Reservation Number"
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
        />
        <input
          value={guestName}
          onChange={(event) => setGuestName(event.target.value)}
          placeholder="Guest Name"
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
        />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { void loadReport(); }}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Apply Filters'}
        </button>
        <button
          type="button"
          onClick={() => {
            setStartDate('');
            setEndDate('');
            setPaymentMethod('ALL');
            setPaymentStatus('ALL');
            setReservationNumber('');
            setGuestName('');
          }}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
        >
          Reset
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">Cash Revenue</p>
          <p className="mt-2 text-2xl font-semibold text-orange-300">{formatMoney(report.cashRevenue)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">GCash Revenue</p>
          <p className="mt-2 text-2xl font-semibold text-cyan-300">{formatMoney(report.gcashRevenue)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">Outstanding Balances</p>
          <p className="mt-2 text-2xl font-semibold text-rose-300">{formatMoney(report.outstandingBalances)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">Refund Summary</p>
          <p className="mt-2 text-lg font-semibold text-amber-300">{report.refundSummary.refundTransactions} refund(s)</p>
          <p className="text-sm text-amber-200">{formatMoney(report.refundSummary.refundAmount)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">Total Payments</p>
          <p className="mt-2 text-2xl font-semibold text-white">{report.totals.totalPayments}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">Matched Reservations</p>
          <p className="mt-2 text-2xl font-semibold text-white">{report.totals.totalReservations}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
        <p className="text-xs uppercase tracking-wider text-slate-500">Payments by Date</p>
        {report.paymentsByDate.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No payments found for current filters.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Payments</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Refund Amount</th>
                  <th className="py-2 pr-3">Net Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {report.paymentsByDate.map((item) => (
                  <tr key={item.date}>
                    <td className="py-2 pr-3 text-white">{item.date}</td>
                    <td className="py-2 pr-3">{item.payments}</td>
                    <td className="py-2 pr-3">{formatMoney(item.amount)}</td>
                    <td className="py-2 pr-3">{formatMoney(item.refundAmount)}</td>
                    <td className="py-2 pr-3 text-emerald-300">{formatMoney(item.netAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
        <p className="text-xs uppercase tracking-wider text-slate-500">Payment Method Breakdown</p>
        {report.paymentMethodBreakdown.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No method breakdown available.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Method</th>
                  <th className="py-2 pr-3">Payments</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Net Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {report.paymentMethodBreakdown.map((item) => (
                  <tr key={item.method}>
                    <td className="py-2 pr-3 text-white">{item.method}</td>
                    <td className="py-2 pr-3">{item.payments}</td>
                    <td className="py-2 pr-3">{formatMoney(item.amount)}</td>
                    <td className="py-2 pr-3 text-emerald-300">{formatMoney(item.netRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
        <p className="text-xs uppercase tracking-wider text-slate-500">Payments</p>
        {report.payments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No payment records matched the selected filters.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs text-slate-300">
              <thead className="text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Payment No</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Reservation</th>
                  <th className="py-2 pr-3">Guest</th>
                  <th className="py-2 pr-3">Method</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {report.payments.map((item) => (
                  <tr key={`${item.paymentNumber}-${item.paymentDate}-${item.referenceNumber}`}>
                    <td className="py-2 pr-3 text-white">{item.paymentNumber}</td>
                    <td className="py-2 pr-3">{item.paymentDate}</td>
                    <td className="py-2 pr-3">{item.reservationNumber || '—'}</td>
                    <td className="py-2 pr-3">{item.guestName || '—'}</td>
                    <td className="py-2 pr-3">{item.paymentMethod}</td>
                    <td className="py-2 pr-3">{item.paymentStatus}</td>
                    <td className="py-2 pr-3">{item.paymentType}</td>
                    <td className="py-2 pr-3 text-emerald-300">{formatMoney(item.amountPaid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
