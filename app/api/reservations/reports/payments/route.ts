import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/app/lib/db';
import Reservation from '@/app/lib/Reservation';
import Payment from '@/app/lib/Payment';
import { requireOwnerOrStaff } from '@/app/lib/auth';
import { computeReservationPaymentRollup, normalizeMoney } from '@/app/lib/paymentTracking';

type PaymentMethodFilter = 'ALL' | 'CASH_ON_ARRIVAL' | 'GCASH';
type PaymentStatusFilter = 'ALL' | 'UNPAID' | 'PENDING_VERIFICATION' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';
type ExportFormat = 'JSON' | 'CSV' | 'PDF' | 'EXCEL';

type PaymentListItem = {
  paymentNumber?: string;
  paymentDate?: Date;
  paymentMethod?: string;
  paymentStatus?: string;
  paymentType?: string;
  amountPaid?: number;
  referenceNumber?: string;
  reservation?: {
    _id?: unknown;
    reservationNumber?: string;
    guestName?: string;
    pricingSummary?: {
      grandTotal?: number;
    };
  } | null;
};

type ReservationSummary = {
  _id?: unknown;
  reservationNumber?: string;
  guestName?: string;
  pricingSummary?: {
    grandTotal?: number;
  };
};

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

function toNumber(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return numeric;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeCsv(value: unknown) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(data: {
  paymentRows: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
  paymentByDate: Array<Record<string, unknown>>;
  methodBreakdown: Array<Record<string, unknown>>;
  refundSummary: Record<string, unknown>;
}) {
  const lines: string[] = [];

  lines.push('Payment Report Summary');
  Object.entries(data.summary).forEach(([key, value]) => {
    lines.push(`${escapeCsv(key)},${escapeCsv(value)}`);
  });
  lines.push('');

  lines.push('Payments By Date');
  lines.push('Date,Payments,Amount,Refund Amount,Net Amount');
  data.paymentByDate.forEach((row) => {
    lines.push([
      escapeCsv(row.date),
      escapeCsv(row.payments),
      escapeCsv(row.amount),
      escapeCsv(row.refundAmount),
      escapeCsv(row.netAmount),
    ].join(','));
  });
  lines.push('');

  lines.push('Payment Method Breakdown');
  lines.push('Method,Payments,Amount,Net Revenue');
  data.methodBreakdown.forEach((row) => {
    lines.push([
      escapeCsv(row.method),
      escapeCsv(row.payments),
      escapeCsv(row.amount),
      escapeCsv(row.netRevenue),
    ].join(','));
  });
  lines.push('');

  lines.push('Refund Summary');
  Object.entries(data.refundSummary).forEach(([key, value]) => {
    lines.push(`${escapeCsv(key)},${escapeCsv(value)}`);
  });
  lines.push('');

  lines.push('Payments');
  lines.push('Payment No,Date,Reservation No,Guest Name,Method,Status,Type,Amount,Reference');
  data.paymentRows.forEach((row) => {
    lines.push([
      escapeCsv(row.paymentNumber),
      escapeCsv(row.paymentDate),
      escapeCsv(row.reservationNumber),
      escapeCsv(row.guestName),
      escapeCsv(row.paymentMethod),
      escapeCsv(row.paymentStatus),
      escapeCsv(row.paymentType),
      escapeCsv(row.amountPaid),
      escapeCsv(row.referenceNumber),
    ].join(','));
  });

  return lines.join('\n');
}

function buildExcelHtml(data: {
  paymentRows: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
}) {
  const summaryRows = Object.entries(data.summary)
    .map(([key, value]) => `<tr><td>${key}</td><td>${value}</td></tr>`)
    .join('');

  const paymentRows = data.paymentRows
    .map((row) => `
      <tr>
        <td>${row.paymentNumber ?? ''}</td>
        <td>${row.paymentDate ?? ''}</td>
        <td>${row.reservationNumber ?? ''}</td>
        <td>${row.guestName ?? ''}</td>
        <td>${row.paymentMethod ?? ''}</td>
        <td>${row.paymentStatus ?? ''}</td>
        <td>${row.paymentType ?? ''}</td>
        <td>${row.amountPaid ?? ''}</td>
        <td>${row.referenceNumber ?? ''}</td>
      </tr>
    `)
    .join('');

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Payment Report</title>
  </head>
  <body>
    <h2>Payment Report Summary</h2>
    <table border="1" cellspacing="0" cellpadding="4">${summaryRows}</table>
    <h2>Payments</h2>
    <table border="1" cellspacing="0" cellpadding="4">
      <thead>
        <tr>
          <th>Payment No</th>
          <th>Date</th>
          <th>Reservation No</th>
          <th>Guest Name</th>
          <th>Method</th>
          <th>Status</th>
          <th>Type</th>
          <th>Amount</th>
          <th>Reference</th>
        </tr>
      </thead>
      <tbody>${paymentRows}</tbody>
    </table>
  </body>
</html>`;
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildSimplePdf(lines: string[]) {
  const contentLines = ['BT', '/F1 10 Tf', '40 800 Td'];

  lines.forEach((line, index) => {
    const escaped = escapePdfText(line);
    if (index === 0) {
      contentLines.push(`(${escaped}) Tj`);
    } else {
      contentLines.push('0 -14 Td');
      contentLines.push(`(${escaped}) Tj`);
    }
  });

  contentLines.push('ET');
  const streamContent = `${contentLines.join('\n')}\n`;

  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  objects.push(`5 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf8')} >>\nstream\n${streamContent}endstream\nendobj\n`);

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  objects.forEach((object) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += object;
  });

  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

function parseExportFormat(value: string | null): ExportFormat {
  const normalized = (value || '').trim().toUpperCase();
  if (normalized === 'CSV') return 'CSV';
  if (normalized === 'PDF') return 'PDF';
  if (normalized === 'EXCEL' || normalized === 'XLS') return 'EXCEL';
  return 'JSON';
}

export async function GET(request: Request) {
  try {
    const authError = requireOwnerOrStaff(request);
    if (authError) return authError;

    await connectDB();

    const { searchParams } = new URL(request.url);

    const startDateRaw = searchParams.get('startDate');
    const endDateRaw = searchParams.get('endDate');
    const paymentMethodRaw = (searchParams.get('paymentMethod') || 'ALL').toUpperCase();
    const paymentStatusRaw = (searchParams.get('paymentStatus') || 'ALL').toUpperCase();
    const reservationNumber = (searchParams.get('reservationNumber') || '').trim();
    const guestName = (searchParams.get('guestName') || '').trim();
    const exportFormat = parseExportFormat(searchParams.get('export'));

    const startDate = parseDateOnlyInput(startDateRaw);
    const endDate = parseDateOnlyInput(endDateRaw);

    if (startDateRaw && !startDate) {
      return NextResponse.json({ success: false, message: 'Invalid startDate format. Use YYYY-MM-DD.' }, { status: 400 });
    }

    if (endDateRaw && !endDate) {
      return NextResponse.json({ success: false, message: 'Invalid endDate format. Use YYYY-MM-DD.' }, { status: 400 });
    }

    if (startDate && endDate && endDate < startDate) {
      return NextResponse.json({ success: false, message: 'endDate must be greater than or equal to startDate.' }, { status: 400 });
    }

    const paymentMethod: PaymentMethodFilter =
      paymentMethodRaw === 'CASH_ON_ARRIVAL' || paymentMethodRaw === 'GCASH' ? paymentMethodRaw : 'ALL';

    const paymentStatus: PaymentStatusFilter =
      paymentStatusRaw === 'UNPAID' ||
      paymentStatusRaw === 'PENDING_VERIFICATION' ||
      paymentStatusRaw === 'PARTIALLY_PAID' ||
      paymentStatusRaw === 'PAID' ||
      paymentStatusRaw === 'REFUNDED'
        ? paymentStatusRaw
        : 'ALL';

    const reservationQuery: Record<string, unknown> = {};
    if (reservationNumber) {
      reservationQuery.reservationNumber = { $regex: reservationNumber, $options: 'i' };
    }
    if (guestName) {
      reservationQuery.guestName = { $regex: guestName, $options: 'i' };
    }

    let reservationIdsFilter: string[] | null = null;
    if (reservationNumber || guestName) {
      const matchedReservations = await Reservation.find(reservationQuery).select('_id').lean();
      reservationIdsFilter = matchedReservations.map((item) => String(item._id));
    }

    const query: Record<string, unknown> = {};

    if (startDate || endDate) {
      const dateRange: Record<string, Date> = {};
      if (startDate) dateRange.$gte = startDate;
      if (endDate) {
        const endExclusive = new Date(endDate);
        endExclusive.setDate(endExclusive.getDate() + 1);
        dateRange.$lt = endExclusive;
      }
      query.paymentDate = dateRange;
    }

    if (paymentMethod !== 'ALL') {
      query.paymentMethod = paymentMethod;
    }

    if (paymentStatus !== 'ALL') {
      query.paymentStatus = paymentStatus;
    }

    if (reservationIdsFilter) {
      query.reservation = { $in: reservationIdsFilter.map((id) => new mongoose.Types.ObjectId(id)) };
    }

    const paymentsRaw = await Payment.find(query)
      .populate('reservation', 'reservationNumber guestName pricingSummary.grandTotal paymentStatus')
      .sort({ paymentDate: -1, createdAt: -1 })
      .lean();

    const payments = paymentsRaw as unknown as PaymentListItem[];

    const paymentByDateMap = new Map<string, { payments: number; amount: number; refundAmount: number; netAmount: number }>();
    const methodBreakdownMap = new Map<string, { payments: number; amount: number; netRevenue: number }>();

    const refunds = {
      refundTransactions: 0,
      refundAmount: 0,
    };

    payments.forEach((payment) => {
      const paymentDate = payment.paymentDate instanceof Date ? payment.paymentDate : new Date(String(payment.paymentDate || ''));
      if (Number.isNaN(paymentDate.getTime())) return;

      const key = formatDateKey(paymentDate);
      const amount = toNumber(payment.amountPaid);
      const status = String(payment.paymentStatus || '').toUpperCase();
      const type = String(payment.paymentType || '').toUpperCase();
      const method = String(payment.paymentMethod || '').toUpperCase();
      const isRefund = type === 'REFUND' || status === 'REFUNDED';

      const dateEntry = paymentByDateMap.get(key) || { payments: 0, amount: 0, refundAmount: 0, netAmount: 0 };
      dateEntry.payments += 1;
      dateEntry.amount += amount;
      if (isRefund) {
        dateEntry.refundAmount += amount;
        dateEntry.netAmount -= amount;
      } else {
        dateEntry.netAmount += amount;
      }
      paymentByDateMap.set(key, dateEntry);

      const methodEntry = methodBreakdownMap.get(method || 'UNKNOWN') || { payments: 0, amount: 0, netRevenue: 0 };
      methodEntry.payments += 1;
      methodEntry.amount += amount;
      methodEntry.netRevenue += isRefund ? -amount : amount;
      methodBreakdownMap.set(method || 'UNKNOWN', methodEntry);

      if (isRefund) {
        refunds.refundTransactions += 1;
        refunds.refundAmount += amount;
      }
    });

    const paymentRollup = computeReservationPaymentRollup(0, payments.map((payment) => ({
      amountPaid: toNumber(payment.amountPaid),
      paymentType: String(payment.paymentType || 'PARTIAL_PAYMENT') as 'RESERVATION_DEPOSIT' | 'PARTIAL_PAYMENT' | 'FULL_PAYMENT' | 'REFUND',
      paymentStatus: String(payment.paymentStatus || 'UNPAID') as 'UNPAID' | 'PENDING_VERIFICATION' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED',
      paymentMethod: String(payment.paymentMethod || 'CASH_ON_ARRIVAL') as 'CASH_ON_ARRIVAL' | 'GCASH',
    })));

    const reservationIds = Array.from(
      new Set(
        payments
          .map((payment) => String(payment.reservation?._id || ''))
          .filter(Boolean)
      )
    );

    const reservations = await Reservation.find({ _id: { $in: reservationIds } })
      .select('_id reservationNumber guestName pricingSummary.grandTotal')
      .lean();

    const paymentsByReservationId = new Map<string, PaymentListItem[]>();
    payments.forEach((payment) => {
      const reservationId = String(payment.reservation?._id || '');
      if (!reservationId) return;
      const existing = paymentsByReservationId.get(reservationId);
      if (existing) {
        existing.push(payment);
      } else {
        paymentsByReservationId.set(reservationId, [payment]);
      }
    });

    let outstandingBalances = 0;
    reservations.forEach((reservation) => {
      const reservationId = String((reservation as ReservationSummary)._id || '');
      if (!reservationId) return;

      const totalDue = toNumber((reservation as ReservationSummary).pricingSummary?.grandTotal);
      const reservationPayments = (paymentsByReservationId.get(reservationId) || []).map((payment) => ({
        amountPaid: toNumber(payment.amountPaid),
        paymentType: String(payment.paymentType || 'PARTIAL_PAYMENT') as 'RESERVATION_DEPOSIT' | 'PARTIAL_PAYMENT' | 'FULL_PAYMENT' | 'REFUND',
        paymentStatus: String(payment.paymentStatus || 'UNPAID') as 'UNPAID' | 'PENDING_VERIFICATION' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED',
        paymentMethod: String(payment.paymentMethod || 'CASH_ON_ARRIVAL') as 'CASH_ON_ARRIVAL' | 'GCASH',
      }));

      const rollup = computeReservationPaymentRollup(totalDue, reservationPayments);
      outstandingBalances += rollup.outstandingBalance;
    });

    const paymentsByDate = Array.from(paymentByDateMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, values]) => ({
        date,
        payments: values.payments,
        amount: normalizeMoney(values.amount),
        refundAmount: normalizeMoney(values.refundAmount),
        netAmount: normalizeMoney(values.netAmount),
      }));

    const methodBreakdown = Array.from(methodBreakdownMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([method, values]) => ({
        method,
        payments: values.payments,
        amount: normalizeMoney(values.amount),
        netRevenue: normalizeMoney(values.netRevenue),
      }));

    const paymentRows = payments.map((payment) => {
      const paymentDate = payment.paymentDate instanceof Date ? payment.paymentDate : new Date(String(payment.paymentDate || ''));
      return {
        paymentNumber: String(payment.paymentNumber || ''),
        paymentDate: Number.isNaN(paymentDate.getTime()) ? '' : formatDateKey(paymentDate),
        reservationNumber: String(payment.reservation?.reservationNumber || ''),
        guestName: String(payment.reservation?.guestName || ''),
        paymentMethod: String(payment.paymentMethod || ''),
        paymentStatus: String(payment.paymentStatus || ''),
        paymentType: String(payment.paymentType || ''),
        amountPaid: normalizeMoney(toNumber(payment.amountPaid)),
        referenceNumber: String(payment.referenceNumber || ''),
      };
    });

    const summary = {
      totalPayments: payments.length,
      cashRevenue: paymentRollup.methodSummary.cashRevenue,
      gcashRevenue: paymentRollup.methodSummary.gcashRevenue,
      outstandingBalances: normalizeMoney(outstandingBalances),
      refundTransactions: refunds.refundTransactions,
      refundAmount: normalizeMoney(refunds.refundAmount),
    };

    if (exportFormat === 'CSV') {
      const csv = buildCsv({
        paymentRows,
        summary,
        paymentByDate: paymentsByDate,
        methodBreakdown,
        refundSummary: {
          refundTransactions: summary.refundTransactions,
          refundAmount: summary.refundAmount,
        },
      });

      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="payment-report-${Date.now()}.csv"`,
        },
      });
    }

    if (exportFormat === 'EXCEL') {
      const html = buildExcelHtml({ paymentRows, summary });
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
          'Content-Disposition': `attachment; filename="payment-report-${Date.now()}.xls"`,
        },
      });
    }

    if (exportFormat === 'PDF') {
      const lines = [
        'La Velleza Payment Report',
        `Total Payments: ${summary.totalPayments}`,
        `Cash Revenue: PHP ${summary.cashRevenue.toFixed(2)}`,
        `GCash Revenue: PHP ${summary.gcashRevenue.toFixed(2)}`,
        `Outstanding Balances: PHP ${summary.outstandingBalances.toFixed(2)}`,
        `Refund Transactions: ${summary.refundTransactions}`,
        `Refund Amount: PHP ${summary.refundAmount.toFixed(2)}`,
        '',
        'Recent Payments:',
      ];

      paymentRows.slice(0, 25).forEach((row) => {
        lines.push(`${row.paymentDate} | ${row.paymentNumber} | ${row.reservationNumber} | ${row.paymentMethod} | PHP ${Number(row.amountPaid || 0).toFixed(2)}`);
      });

      const pdfBuffer = buildSimplePdf(lines);
      return new Response(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="payment-report-${Date.now()}.pdf"`,
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        filters: {
          startDate: startDate ? formatDateKey(startDate) : null,
          endDate: endDate ? formatDateKey(endDate) : null,
          paymentMethod,
          paymentStatus,
          reservationNumber,
          guestName,
        },
        report: {
          paymentsByDate,
          cashRevenue: summary.cashRevenue,
          gcashRevenue: summary.gcashRevenue,
          outstandingBalances: summary.outstandingBalances,
          refundSummary: {
            refundTransactions: summary.refundTransactions,
            refundAmount: summary.refundAmount,
          },
          paymentMethodBreakdown: methodBreakdown,
          payments: paymentRows,
          totals: {
            totalPayments: summary.totalPayments,
            totalReservations: reservations.length,
          },
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to generate payment report.' }, { status: 500 });
  }
}
