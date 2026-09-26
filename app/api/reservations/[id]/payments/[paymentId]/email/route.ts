import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/app/lib/db';
import Reservation from '@/app/lib/Reservation';
import Payment from '@/app/lib/Payment';
import { requireOwnerOrStaff } from '@/app/lib/auth';
import { computeReservationPaymentRollup } from '@/app/lib/paymentTracking';
import { sendGmailMessage } from '@/app/lib/gmailService';
import { writeAuditLog } from '@/app/lib/auditLogWriter';

function formatDate(value: Date | string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-PH', { dateStyle: 'long' }).format(date);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const authError = requireOwnerOrStaff(request);
  if (authError) return authError;

  try {
    await connectDB();
    const { id, paymentId } = await params;
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(paymentId)) {
      return NextResponse.json({ success: false, message: 'Invalid reservation or payment ID.' }, { status: 400 });
    }

    const reservation = await Reservation.findById(id)
      .select('reservationNumber guestName email pricingSummary.grandTotal pricingSummary.addOns')
      .lean();
    if (!reservation) return NextResponse.json({ success: false, message: 'Reservation not found.' }, { status: 404 });
    if (!reservation.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservation.email)) {
      return NextResponse.json({ success: false, message: 'This reservation does not have a valid customer email address.' }, { status: 400 });
    }

    const [receipt, payments] = await Promise.all([
      Payment.findOne({ _id: paymentId, reservation: id }).lean(),
      Payment.find({ reservation: id }).sort({ paymentDate: 1, createdAt: 1 }).lean(),
    ]);
    if (!receipt) return NextResponse.json({ success: false, message: 'Payment not found for this reservation.' }, { status: 404 });
    if (!receipt.receiptNumber) {
      return NextResponse.json({ success: false, message: 'Generate the official receipt before emailing it.' }, { status: 400 });
    }

    const totalDue = Number(reservation.pricingSummary?.grandTotal || 0);
    const rollup = computeReservationPaymentRollup(totalDue, payments);
    const paymentRows = payments.map((payment) => (
      `${payment.paymentNumber} | ${formatDate(payment.paymentDate)} | ${payment.paymentMethod} | ${payment.paymentType} | ${formatMoney(Number(payment.amountPaid || 0))} | ${payment.paymentStatus}`
    ));
    const addOnRows = (reservation.pricingSummary?.addOns || []).map((addOn) => (
      `${Number(addOn.quantity || 0)}x ${addOn.name}: ${formatMoney(Number(addOn.totalPrice || 0))}`
    ));
    const subject = `La Velleza official receipt ${receipt.receiptNumber}`;
    const text = [
      'LA VELLEZA RESORT',
      'OFFICIAL RECEIPT',
      '',
      `Receipt number: ${receipt.receiptNumber}`,
      `Receipt date: ${formatDate(receipt.receiptDate || receipt.paymentDate)}`,
      `Issued by: ${receipt.issuedBy || 'STAFF'}`,
      '',
      `Reservation number: ${reservation.reservationNumber}`,
      `Guest: ${reservation.guestName}`,
      '',
      'PAYMENT TRANSACTIONS',
      'Payment number | Date | Method | Type | Amount | Status',
      ...paymentRows,
      ...(addOnRows.length ? ['', 'RESERVATION ADD-ONS', ...addOnRows] : []),
      '',
      `Total due: ${formatMoney(totalDue)}`,
      `Total recognized paid: ${formatMoney(rollup.recognizedPaid)}`,
      `Change due: ${formatMoney(Math.max(rollup.recognizedPaid - totalDue, 0))}`,
      `Remaining balance: ${formatMoney(rollup.outstandingBalance)}`,
      '',
      'Thank you,',
      'La Velleza Resort',
    ].join('\n');

    await sendGmailMessage({ to: reservation.email, subject, text });
    await writeAuditLog(request, {
      action: 'EMAIL_OFFICIAL_RECEIPT',
      entityType: 'PAYMENT',
      entityId: String(receipt._id),
      entityLabel: receipt.receiptNumber,
      summary: `Emailed official receipt ${receipt.receiptNumber} to the customer.`,
      changedFields: [],
    });

    return NextResponse.json({ success: true, message: `Receipt emailed to ${reservation.email}.` });
  } catch (error) {
    console.error('RECEIPT EMAIL ERROR:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unable to email the official receipt.',
    }, { status: 502 });
  }
}