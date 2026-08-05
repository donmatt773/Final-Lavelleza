import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/app/lib/db';
import Reservation from '@/app/lib/Reservation';
import Payment from '@/app/lib/Payment';
import { getSessionFromRequest, requireOwnerOrStaff } from '@/app/lib/auth';
import { computeReservationPaymentRollup, generatePaymentNumber, generateReceiptNumber, syncReservationPaymentStatus } from '@/app/lib/paymentTracking';

const VALID_PAYMENT_METHODS = ['CASH_ON_ARRIVAL', 'GCASH'] as const;
const VALID_PAYMENT_TYPES = ['RESERVATION_DEPOSIT', 'PARTIAL_PAYMENT', 'FULL_PAYMENT', 'REFUND'] as const;
const VALID_PAYMENT_STATUSES = ['UNPAID', 'PENDING_VERIFICATION', 'PARTIALLY_PAID', 'PAID', 'REFUNDED'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeDateInput(value: unknown, field: string, errors: string[]) {
  if (value === undefined || value === null || value === '') return new Date();
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    errors.push(`${field} must be a valid date.`);
    return null;
  }
  return date;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireOwnerOrStaff(request);
    if (authError) return authError;

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid reservation ID.' }, { status: 400 });
    }

    const reservation = await Reservation.findById(id)
      .select('pricingSummary.grandTotal paymentStatus')
      .lean();

    if (!reservation) {
      return NextResponse.json({ success: false, message: 'Reservation not found.' }, { status: 404 });
    }

    const payments = await Payment.find({ reservation: id }).sort({ paymentDate: -1, createdAt: -1 }).lean();
    const rollup = computeReservationPaymentRollup(Number(reservation?.pricingSummary?.grandTotal || 0), payments);

    return NextResponse.json(
      {
        success: true,
        payments,
        summary: {
          ...rollup,
          reservationPaymentStatus: reservation.paymentStatus,
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to load payment history.' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireOwnerOrStaff(request);
    if (authError) return authError;

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid reservation ID.' }, { status: 400 });
    }

    const reservation = await Reservation.findById(id)
      .select('pricingSummary.grandTotal paymentStatus')
      .lean();

    if (!reservation) {
      return NextResponse.json({ success: false, message: 'Reservation not found.' }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body.' }, { status: 400 });
    }

    if (!isRecord(body)) {
      return NextResponse.json({ success: false, message: 'Request body must be a JSON object.' }, { status: 400 });
    }

    const errors: string[] = [];

    const paymentMethod = String(body.paymentMethod || '').trim().toUpperCase();
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod as (typeof VALID_PAYMENT_METHODS)[number])) {
      errors.push('paymentMethod must be CASH_ON_ARRIVAL or GCASH.');
    }

    const paymentType = String(body.paymentType || '').trim().toUpperCase();
    if (!VALID_PAYMENT_TYPES.includes(paymentType as (typeof VALID_PAYMENT_TYPES)[number])) {
      errors.push('paymentType must be RESERVATION_DEPOSIT, PARTIAL_PAYMENT, FULL_PAYMENT, or REFUND.');
    }

    const amountPaid = Number(body.amountPaid);
    if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
      errors.push('amountPaid must be greater than zero.');
    }

    const paymentDate = normalizeDateInput(body.paymentDate, 'paymentDate', errors);

    const referenceNumber = typeof body.referenceNumber === 'string' ? body.referenceNumber.trim() : '';
    if (paymentMethod === 'GCASH' && !referenceNumber) {
      errors.push('referenceNumber is required for GCASH payments.');
    }

    let paymentStatus = String(body.paymentStatus || '').trim().toUpperCase();
    if (!paymentStatus) {
      paymentStatus = paymentMethod === 'GCASH' ? 'PENDING_VERIFICATION' : 'UNPAID';
    }

    if (!VALID_PAYMENT_STATUSES.includes(paymentStatus as (typeof VALID_PAYMENT_STATUSES)[number])) {
      errors.push('paymentStatus is invalid.');
    }

    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    const proofOfPaymentUrl = typeof body.proofOfPaymentUrl === 'string' ? body.proofOfPaymentUrl.trim() : '';

    const session = getSessionFromRequest(request);
    const receivedBy = typeof body.receivedBy === 'string' && body.receivedBy.trim()
      ? body.receivedBy.trim()
      : session
        ? `${session.name} (${session.employeeId})`
        : 'STAFF';

    const existingPayments = await Payment.find({ reservation: id })
      .select('amountPaid paymentType paymentStatus paymentMethod')
      .lean();

    const totalDue = Number(reservation?.pricingSummary?.grandTotal || 0);
    const currentRollup = computeReservationPaymentRollup(totalDue, existingPayments);

    if (paymentType !== 'REFUND' && amountPaid > currentRollup.outstandingBalance) {
      errors.push('Payment amount cannot exceed outstanding balance.');
    }

    if (paymentType === 'REFUND' && amountPaid > Math.max(currentRollup.recognizedPaid, 0)) {
      errors.push('Refund amount cannot exceed total recognized paid amount.');
    }

    if (errors.length > 0) {
      return NextResponse.json({ success: false, message: 'Invalid payment data.', errors }, { status: 400 });
    }

    if (paymentMethod === 'CASH_ON_ARRIVAL' && paymentType !== 'REFUND') {
      const projectedPaid = currentRollup.recognizedPaid + amountPaid;
      paymentStatus = projectedPaid >= totalDue ? 'PAID' : 'PARTIALLY_PAID';
    }

    if (paymentType === 'REFUND') {
      paymentStatus = 'REFUNDED';
    }

    const projectedPayments = [
      ...existingPayments,
      {
        amountPaid,
        paymentType,
        paymentStatus,
        paymentMethod,
      } as any,
    ];

    const projectedRollup = computeReservationPaymentRollup(totalDue, projectedPayments);
    const paymentNumber = await generatePaymentNumber();

    const payment = await Payment.create({
      paymentNumber,
      reservation: id,
      paymentDate,
      paymentMethod,
      referenceNumber: referenceNumber || undefined,
      amountPaid,
      balanceRemaining: projectedRollup.outstandingBalance,
      paymentType,
      paymentStatus,
      receivedBy,
      notes: notes || undefined,
      proofOfPaymentUrl: proofOfPaymentUrl || undefined,
    });

    const { rollup } = await syncReservationPaymentStatus(id);

    return NextResponse.json(
      {
        success: true,
        payment,
        reservationPaymentStatus: rollup.reservationPaymentStatus,
        summary: rollup,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const errorWithCode = error as { code?: unknown };
    if (errorWithCode?.code === 11000) {
      return NextResponse.json({ success: false, message: 'Payment number conflict. Please try again.' }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: 'Failed to record payment.' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireOwnerOrStaff(request);
    if (authError) return authError;

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid reservation ID.' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body.' }, { status: 400 });
    }

    if (!isRecord(body)) {
      return NextResponse.json({ success: false, message: 'Request body must be a JSON object.' }, { status: 400 });
    }

    const action = String(body.action || '').trim().toUpperCase();

    const paymentId = String(body.paymentId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(paymentId)) {
      return NextResponse.json({ success: false, message: 'paymentId must be a valid payment ID.' }, { status: 400 });
    }

    if (action === 'GENERATE_RECEIPT') {
      const payment = await Payment.findOne({ _id: paymentId, reservation: id }).lean();
      if (!payment) {
        return NextResponse.json({ success: false, message: 'Payment not found for this reservation.' }, { status: 404 });
      }

      const normalizedStatus = String(payment.paymentStatus || '').toUpperCase();
      if (normalizedStatus !== 'PAID' && normalizedStatus !== 'PARTIALLY_PAID') {
        return NextResponse.json({ success: false, message: 'Official receipts can only be generated for verified paid payments.' }, { status: 400 });
      }

      const session = getSessionFromRequest(request);
      const issuedBy = typeof body.issuedBy === 'string' && body.issuedBy.trim()
        ? body.issuedBy.trim()
        : session
          ? `${session.name} (${session.employeeId})`
          : 'STAFF';

      const receiptDate = normalizeDateInput(body.receiptDate, 'receiptDate', []);

      if (payment.receiptNumber) {
        return NextResponse.json(
          {
            success: true,
            payment,
            message: 'Receipt already exists for this payment.',
          },
          { status: 200 }
        );
      }

      const receiptNumber = await generateReceiptNumber();
      const updated = await Payment.findByIdAndUpdate(
        paymentId,
        {
          receiptNumber,
          receiptDate: receiptDate || new Date(),
          issuedBy,
        },
        { new: true }
      ).lean();

      return NextResponse.json(
        {
          success: true,
          payment: updated,
          message: 'Official receipt generated successfully.',
        },
        { status: 200 }
      );
    }

    const paymentStatus = String(body.paymentStatus || '').trim().toUpperCase();
    if (!VALID_PAYMENT_STATUSES.includes(paymentStatus as (typeof VALID_PAYMENT_STATUSES)[number])) {
      return NextResponse.json({ success: false, message: 'paymentStatus is invalid.' }, { status: 400 });
    }

    const payment = await Payment.findOne({ _id: paymentId, reservation: id }).lean();
    if (!payment) {
      return NextResponse.json({ success: false, message: 'Payment not found for this reservation.' }, { status: 404 });
    }

    const updatePayload: Record<string, unknown> = {
      paymentStatus,
    };

    if (body.notes !== undefined) {
      updatePayload.notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    }

    if (body.referenceNumber !== undefined) {
      updatePayload.referenceNumber = typeof body.referenceNumber === 'string' ? body.referenceNumber.trim() : '';
    }

    const updated = await Payment.findByIdAndUpdate(paymentId, updatePayload, { new: true }).lean();

    const reservation = await Reservation.findById(id).select('pricingSummary.grandTotal').lean();
    const payments = await Payment.find({ reservation: id })
      .select('amountPaid paymentType paymentStatus paymentMethod')
      .lean();

    const totalDue = Number(reservation?.pricingSummary?.grandTotal || 0);
    const rollup = computeReservationPaymentRollup(totalDue, payments);

    await Payment.findByIdAndUpdate(paymentId, {
      balanceRemaining: rollup.outstandingBalance,
    });

    const synced = await syncReservationPaymentStatus(id);

    return NextResponse.json(
      {
        success: true,
        payment: updated,
        reservationPaymentStatus: synced.rollup.reservationPaymentStatus,
        summary: synced.rollup,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const errorWithCode = error as { code?: unknown };
    if (errorWithCode?.code === 11000) {
      return NextResponse.json({ success: false, message: 'Receipt number conflict. Please try again.' }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: 'Failed to update payment.' }, { status: 500 });
  }
}
