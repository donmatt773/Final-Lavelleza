import mongoose from 'mongoose';
import Reservation from '@/app/lib/Reservation';
import Payment, { IPayment } from '@/app/lib/Payment';

export type ReservationPaymentStatus = 'UNPAID' | 'PENDING_VERIFICATION' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';

const RECOGNIZED_STATUSES = new Set(['PAID', 'PARTIALLY_PAID', 'REFUNDED']);

export function normalizeMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function computeReservationPaymentRollup(
  totalDue: number,
  payments: Array<Pick<IPayment, 'amountPaid' | 'paymentType' | 'paymentStatus' | 'paymentMethod'>>
) {
  let recognizedPaid = 0;
  let pendingCount = 0;
  let hasRefundRecord = false;

  let cashPayments = 0;
  let gcashPayments = 0;
  let cashRevenue = 0;
  let gcashRevenue = 0;

  for (const payment of payments) {
    if (payment.paymentMethod === 'CASH_ON_ARRIVAL') {
      cashPayments += 1;
    } else if (payment.paymentMethod === 'GCASH') {
      gcashPayments += 1;
    }

    if (!RECOGNIZED_STATUSES.has(String(payment.paymentStatus || '').toUpperCase())) {
      if (String(payment.paymentStatus || '').toUpperCase() === 'PENDING_VERIFICATION') {
        pendingCount += 1;
      }
      continue;
    }

    const amount = Number(payment.amountPaid || 0);
    if (payment.paymentType === 'REFUND' || String(payment.paymentStatus || '').toUpperCase() === 'REFUNDED') {
      recognizedPaid -= amount;
      hasRefundRecord = true;
      if (payment.paymentMethod === 'CASH_ON_ARRIVAL') {
        cashRevenue -= amount;
      } else if (payment.paymentMethod === 'GCASH') {
        gcashRevenue -= amount;
      }
    } else {
      recognizedPaid += amount;
      if (payment.paymentMethod === 'CASH_ON_ARRIVAL') {
        cashRevenue += amount;
      } else if (payment.paymentMethod === 'GCASH') {
        gcashRevenue += amount;
      }
    }
  }

  recognizedPaid = normalizeMoney(recognizedPaid);
  const outstandingBalance = normalizeMoney(Math.max(totalDue - recognizedPaid, 0));

  let reservationPaymentStatus: ReservationPaymentStatus = 'UNPAID';
  if (recognizedPaid <= 0) {
    if (hasRefundRecord) {
      reservationPaymentStatus = 'REFUNDED';
    } else if (pendingCount > 0) {
      reservationPaymentStatus = 'PENDING_VERIFICATION';
    } else {
      reservationPaymentStatus = 'UNPAID';
    }
  } else if (recognizedPaid < totalDue) {
    reservationPaymentStatus = 'PARTIALLY_PAID';
  } else {
    reservationPaymentStatus = 'PAID';
  }

  return {
    totalDue: normalizeMoney(totalDue),
    recognizedPaid,
    outstandingBalance,
    pendingCount,
    reservationPaymentStatus,
    methodSummary: {
      cashPayments,
      gcashPayments,
      cashRevenue: normalizeMoney(cashRevenue),
      gcashRevenue: normalizeMoney(gcashRevenue),
    },
  };
}

export async function generatePaymentNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const prefix = `PAY-${year}${month}${day}`;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const paymentNumber = `${prefix}-${suffix}`;
    const exists = await Payment.exists({ paymentNumber });
    if (!exists) return paymentNumber;
  }

  const fallbackSuffix = `${Date.now()}`.slice(-6);
  return `${prefix}-${fallbackSuffix}`;
}

export async function generateReceiptNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const prefix = `OR-${year}${month}${day}`;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const receiptNumber = `${prefix}-${suffix}`;
    const exists = await Payment.exists({ receiptNumber });
    if (!exists) return receiptNumber;
  }

  const fallbackSuffix = `${Date.now()}`.slice(-6);
  return `${prefix}-${fallbackSuffix}`;
}

export async function syncReservationPaymentStatus(reservationId: string) {
  if (!mongoose.Types.ObjectId.isValid(reservationId)) {
    throw new Error('Invalid reservation ID for payment sync.');
  }

  const reservation = await Reservation.findById(reservationId)
    .select('pricingSummary.grandTotal paymentStatus')
    .lean();

  if (!reservation) {
    throw new Error('Reservation not found for payment sync.');
  }

  const payments = await Payment.find({ reservation: reservationId })
    .select('amountPaid paymentType paymentStatus paymentMethod')
    .lean();

  const totalDue = Number(reservation?.pricingSummary?.grandTotal || 0);
  const rollup = computeReservationPaymentRollup(totalDue, payments);

  await Reservation.findByIdAndUpdate(reservationId, {
    paymentStatus: rollup.reservationPaymentStatus,
  });

  return {
    rollup,
    totalDue,
  };
}
