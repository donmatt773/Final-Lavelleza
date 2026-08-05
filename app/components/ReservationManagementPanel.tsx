'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ReservationCalendar from '@/app/components/ReservationCalendar';
import ReservationForm from '@/app/components/ReservationForm';

type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW' | 'CHECKED_IN' | 'CHECKED_OUT';

const STATUS_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING: ['PENDING', 'CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['CHECKED_IN', 'CHECKED_OUT'],
  CHECKED_OUT: ['CHECKED_OUT'],
  CANCELLED: ['CANCELLED'],
  NO_SHOW: ['NO_SHOW'],
};

const RESERVATION_STATUS_STYLES: Record<ReservationStatus, string> = {
  PENDING: 'bg-amber-500/10 text-amber-300 border-amber-700/40',
  CONFIRMED: 'bg-emerald-500/10 text-emerald-300 border-emerald-700/40',
  CANCELLED: 'bg-rose-500/10 text-rose-300 border-rose-700/40',
  NO_SHOW: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-700/40',
  CHECKED_IN: 'bg-sky-500/10 text-sky-300 border-sky-700/40',
  CHECKED_OUT: 'bg-slate-500/10 text-slate-300 border-slate-700/40',
};

const PAYMENT_STATUS_STYLES: Record<ReservationPaymentStatus, string> = {
  UNPAID: 'bg-rose-500/10 text-rose-300 border-rose-700/40',
  PENDING_VERIFICATION: 'bg-sky-500/10 text-sky-300 border-sky-700/40',
  PARTIALLY_PAID: 'bg-amber-500/10 text-amber-300 border-amber-700/40',
  PAID: 'bg-emerald-500/10 text-emerald-300 border-emerald-700/40',
  REFUNDED: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-700/40',
};

function canQuickTransition(fromStatus: ReservationStatus, toStatus: ReservationStatus) {
  return STATUS_TRANSITIONS[fromStatus].includes(toStatus);
}

type ReservationPricingSummary = {
  currency: 'PHP';
  roomRate: number;
  numberOfNights: number;
  extraPersonFee: number;
  extraBedFee: number;
  promoDiscount: number;
  additionalRoomDiscount: number;
  subtotal: number;
  grandTotal: number;
};

type ReservationSource = 'ONLINE' | 'WALK_IN';
type ReservationPaymentStatus = 'UNPAID' | 'PENDING_VERIFICATION' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';

type PaymentMethod = 'CASH_ON_ARRIVAL' | 'GCASH';
type PaymentType = 'RESERVATION_DEPOSIT' | 'PARTIAL_PAYMENT' | 'FULL_PAYMENT' | 'REFUND';

type PaymentRecord = {
  _id: string;
  paymentNumber: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  amountPaid: number;
  balanceRemaining: number;
  paymentType: PaymentType;
  paymentStatus: ReservationPaymentStatus;
  receivedBy: string;
  receiptNumber?: string;
  receiptDate?: string | null;
  issuedBy?: string | null;
  notes?: string;
  proofOfPaymentUrl?: string;
};

type PaymentSummary = {
  totalDue: number;
  recognizedPaid: number;
  outstandingBalance: number;
  pendingCount: number;
  reservationPaymentStatus: ReservationPaymentStatus;
  methodSummary?: {
    cashPayments: number;
    gcashPayments: number;
    cashRevenue: number;
    gcashRevenue: number;
  };
};

type ReservationRecord = {
  _id: string;
  reservationNumber: string;
  guestName: string;
  email: string;
  phone: string;
  address?: string;
  room?: { _id?: string; name?: string; code?: string } | null;
  promo?: {
    _id?: string;
    name?: string;
    code?: string;
    inclusions?: Array<{
      _id?: string;
      type?: string;
      name?: string;
      description?: string;
      quantity?: number;
    }>;
  } | null;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  specialRequests?: string;
  reservationSource?: ReservationSource;
  reservationStatus: ReservationStatus;
  paymentStatus: ReservationPaymentStatus;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  checkedInBy?: string | null;
  checkedOutBy?: string | null;
  pricingSummary?: ReservationPricingSummary;
};

type Props = {
  active: boolean;
};

type RoomOption = {
  _id: string;
  name: string;
  code: string;
};

const PAGE_SIZE = 8;

const normalizeReservationSource = (value?: string | null): ReservationSource => (value === 'WALK_IN' ? 'WALK_IN' : 'ONLINE');

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

export default function ReservationManagementPanel({ active }: Props) {
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [reservationStatusFilter, setReservationStatusFilter] = useState('ALL');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | ReservationSource>('ALL');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');
  const [editingReservation, setEditingReservation] = useState<ReservationRecord | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInLoading, setWalkInLoading] = useState(false);
  const [walkInRooms, setWalkInRooms] = useState<RoomOption[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsSaving, setPaymentsSaving] = useState(false);
  const [paymentActionId, setPaymentActionId] = useState<string | null>(null);
  const [paymentActionType, setPaymentActionType] = useState<'VERIFY' | 'REJECT' | 'GENERATE_RECEIPT' | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    paymentMethod: 'CASH_ON_ARRIVAL' as PaymentMethod,
    paymentType: 'PARTIAL_PAYMENT' as PaymentType,
    amountPaid: '',
    referenceNumber: '',
    notes: '',
    proofOfPaymentUrl: '',
  });
  const [editForm, setEditForm] = useState({
    guestName: '',
    email: '',
    phone: '',
    address: '',
    reservationStatus: 'PENDING' as ReservationStatus,
    paymentStatus: 'UNPAID' as ReservationPaymentStatus,
    checkIn: '',
    checkOut: '',
    adults: '1',
    children: '0',
    specialRequests: '',
  });

  const loadReservationPayments = async (reservationId: string) => {
    setPaymentsLoading(true);
    try {
      const response = await fetch(`/api/reservations/${reservationId}/payments`, { credentials: 'same-origin' });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to load payment history.');
      }

      setPayments(Array.isArray(data?.payments) ? data.payments : []);
      setPaymentSummary(data?.summary || null);
    } catch (error) {
      setPayments([]);
      setPaymentSummary(null);
      setMessage(error instanceof Error ? error.message : 'Unable to load payment history.');
      setMessageType('error');
    } finally {
      setPaymentsLoading(false);
    }
  };

  const openEditForm = (reservation: ReservationRecord) => {
    setEditingReservation(reservation);
    setEditForm({
      guestName: reservation.guestName || '',
      email: reservation.email || '',
      phone: reservation.phone || '',
      address: reservation.address || '',
      reservationStatus: reservation.reservationStatus,
      paymentStatus: reservation.paymentStatus,
      checkIn: reservation.checkIn ? new Date(reservation.checkIn).toISOString().slice(0, 10) : '',
      checkOut: reservation.checkOut ? new Date(reservation.checkOut).toISOString().slice(0, 10) : '',
      adults: String(reservation.adults ?? 1),
      children: String(reservation.children ?? 0),
      specialRequests: reservation.specialRequests || '',
    });

    setPaymentForm({
      paymentMethod: 'CASH_ON_ARRIVAL',
      paymentType: 'PARTIAL_PAYMENT',
      amountPaid: '',
      referenceNumber: '',
      notes: '',
      proofOfPaymentUrl: '',
    });

    void loadReservationPayments(reservation._id);
  };

  const loadReservations = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);

    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (reservationStatusFilter !== 'ALL') params.set('reservationStatus', reservationStatusFilter);
      if (paymentStatusFilter !== 'ALL') params.set('paymentStatus', paymentStatusFilter);
      if (sourceFilter !== 'ALL') params.set('reservationSource', sourceFilter);
      if (startDateFilter) params.set('startDate', startDateFilter);
      if (endDateFilter) params.set('endDate', endDateFilter);

      const query = params.toString();
      const response = await fetch(`/api/reservations${query ? `?${query}` : ''}`, {
        credentials: 'same-origin',
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to load reservations.');
      }

      setReservations(Array.isArray(data) ? data : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load reservations.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  }, [search, reservationStatusFilter, paymentStatusFilter, sourceFilter, startDateFilter, endDateFilter]);

  useEffect(() => {
    if (!active) return;

    const timeoutId = window.setTimeout(() => {
      void loadReservations();
      setPage(1);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [active, loadReservations]);

  const filteredReservations = useMemo(() => {
    if (sourceFilter === 'ALL') return reservations;
    return reservations.filter((reservation) => normalizeReservationSource(reservation.reservationSource) === sourceFilter);
  }, [reservations, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredReservations.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page <= totalPages) return;

    const timeoutId = window.setTimeout(() => {
      setPage(1);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [page, totalPages]);

  const pagedReservations = useMemo(
    () => filteredReservations.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredReservations, safePage]
  );

  const patchReservation = async (id: string, payload: Record<string, unknown>) => {
    setProcessingId(id);
    setMessage(null);

    try {
      const response = await fetch(`/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const detailErrors = Array.isArray(data?.errors)
          ? data.errors.map((item: unknown) => String(item)).filter(Boolean)
          : [];
        const baseMessage = typeof data?.message === 'string' ? data.message : 'Unable to update reservation.';
        throw new Error(detailErrors.length > 0 ? `${baseMessage} ${detailErrors.join(' ')}` : baseMessage);
      }

      setReservations((current) =>
        current.map((reservation) =>
          reservation._id === id
            ? {
                ...reservation,
                reservationStatus: (data?.reservation?.reservationStatus || reservation.reservationStatus) as ReservationRecord['reservationStatus'],
                paymentStatus: (data?.reservation?.paymentStatus || reservation.paymentStatus) as ReservationRecord['paymentStatus'],
                guestName: String(data?.reservation?.guestName || reservation.guestName),
                email: String(data?.reservation?.email || reservation.email),
                phone: String(data?.reservation?.phone || reservation.phone),
                address: String(data?.reservation?.address || reservation.address || ''),
                checkIn: String(data?.reservation?.checkIn || reservation.checkIn),
                checkOut: String(data?.reservation?.checkOut || reservation.checkOut),
                adults: Number(data?.reservation?.adults ?? reservation.adults),
                children: Number(data?.reservation?.children ?? reservation.children),
                specialRequests: String(data?.reservation?.specialRequests || reservation.specialRequests || ''),
                reservationSource: normalizeReservationSource(String(data?.reservation?.reservationSource || reservation.reservationSource || 'ONLINE')),
                pricingSummary: data?.reservation?.pricingSummary || reservation.pricingSummary,
                promo: (data?.reservation?.promo || reservation.promo) as ReservationRecord['promo'],
                checkInAt: data?.reservation?.checkInAt || reservation.checkInAt || null,
                checkOutAt: data?.reservation?.checkOutAt || reservation.checkOutAt || null,
                checkedInBy: data?.reservation?.checkedInBy || reservation.checkedInBy || null,
                checkedOutBy: data?.reservation?.checkedOutBy || reservation.checkedOutBy || null,
              }
            : reservation
        )
      );
      setMessage('Reservation updated successfully.');
      setMessageType('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update reservation.');
      setMessageType('error');
    } finally {
      setProcessingId(null);
    }
  };

  const quickSetStatus = async (reservation: ReservationRecord, targetStatus: ReservationStatus, successMessage: string) => {
    await patchReservation(reservation._id, { reservationStatus: targetStatus });
    setMessage(successMessage);
    setMessageType('success');
  };

  const handleSaveEdit = async () => {
    if (!editingReservation) return;

    await patchReservation(editingReservation._id, {
      guestName: editForm.guestName,
      email: editForm.email,
      phone: editForm.phone,
      address: editForm.address,
      reservationStatus: editForm.reservationStatus,
      paymentStatus: editForm.paymentStatus,
      checkIn: editForm.checkIn,
      checkOut: editForm.checkOut,
      adults: Number(editForm.adults),
      children: Number(editForm.children),
      specialRequests: editForm.specialRequests,
    });
    setEditingReservation(null);
  };

  const refreshReservationPaymentStatus = (reservationId: string, status: ReservationPaymentStatus) => {
    setReservations((current) =>
      current.map((reservation) =>
        reservation._id === reservationId
          ? {
              ...reservation,
              paymentStatus: status,
            }
          : reservation
      )
    );

    setEditingReservation((current) =>
      current && current._id === reservationId
        ? {
            ...current,
            paymentStatus: status,
          }
        : current
    );
  };

  const submitPaymentRecord = async () => {
    if (!editingReservation) return;

    setPaymentsSaving(true);
    setMessage(null);

    try {
      const amount = Number(paymentForm.amountPaid);

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Amount must be greater than zero.');
      }

      if (paymentForm.paymentMethod === 'GCASH' && !paymentForm.referenceNumber.trim()) {
        throw new Error('Reference Number is required for GCash payments.');
      }

      const outstandingBalance = Number(paymentSummary?.outstandingBalance || 0);
      const recognizedPaid = Number(paymentSummary?.recognizedPaid || 0);

      if (paymentForm.paymentType !== 'REFUND' && amount > outstandingBalance) {
        throw new Error('Payment amount cannot exceed outstanding balance.');
      }

      if (paymentForm.paymentType === 'REFUND' && amount > Math.max(recognizedPaid, 0)) {
        throw new Error('Refund amount cannot exceed total recognized paid amount.');
      }

      const response = await fetch(`/api/reservations/${editingReservation._id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          paymentMethod: paymentForm.paymentMethod,
          paymentType: paymentForm.paymentType,
          amountPaid: amount,
          referenceNumber: paymentForm.referenceNumber.trim() || undefined,
          notes: paymentForm.notes.trim() || undefined,
          proofOfPaymentUrl: paymentForm.proofOfPaymentUrl.trim() || undefined,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        const errors = Array.isArray(data?.errors) ? ` ${data.errors.join(' ')}` : '';
        throw new Error(`${typeof data?.message === 'string' ? data.message : 'Unable to record payment.'}${errors}`.trim());
      }

      setPaymentForm({
        paymentMethod: 'CASH_ON_ARRIVAL',
        paymentType: 'PARTIAL_PAYMENT',
        amountPaid: '',
        referenceNumber: '',
        notes: '',
        proofOfPaymentUrl: '',
      });

      await loadReservationPayments(editingReservation._id);
      const nextStatus = String(data?.reservationPaymentStatus || 'UNPAID').toUpperCase() as ReservationPaymentStatus;
      refreshReservationPaymentStatus(editingReservation._id, nextStatus);
      setMessage('Payment recorded successfully.');
      setMessageType('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to record payment.');
      setMessageType('error');
    } finally {
      setPaymentsSaving(false);
    }
  };

  const updatePaymentStatus = async (paymentId: string, paymentStatus: ReservationPaymentStatus) => {
    if (!editingReservation) return;

    setPaymentActionId(paymentId);
    setPaymentActionType(paymentStatus === 'PAID' ? 'VERIFY' : 'REJECT');
    setPaymentsSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/reservations/${editingReservation._id}/payments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          paymentId,
          paymentStatus,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to update payment status.');
      }

      await loadReservationPayments(editingReservation._id);
      const nextStatus = String(data?.reservationPaymentStatus || 'UNPAID').toUpperCase() as ReservationPaymentStatus;
      refreshReservationPaymentStatus(editingReservation._id, nextStatus);
      setMessage('Payment status updated successfully.');
      setMessageType('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update payment status.');
      setMessageType('error');
    } finally {
      setPaymentsSaving(false);
      setPaymentActionId(null);
      setPaymentActionType(null);
    }
  };

  const buildReceiptHtml = (payment: PaymentRecord) => {
    if (!editingReservation || !payment.receiptNumber) return;

    const reservationNumber = editingReservation.reservationNumber || 'N/A';
    const guestName = editingReservation.guestName || 'N/A';
    const receiptDate = payment.receiptDate ? formatDate(payment.receiptDate) : formatDate(payment.paymentDate);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Official Receipt ${payment.receiptNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
            h1 { margin: 0 0 8px 0; font-size: 22px; }
            p { margin: 4px 0; font-size: 14px; }
            .section { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; margin-top: 12px; }
            .label { color: #4b5563; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
            .value { font-weight: 600; font-size: 15px; }
          </style>
        </head>
        <body>
          <h1>Official Receipt</h1>
          <p>La Velleza Resort Booking System</p>

          <div class="section">
            <p class="label">Receipt Number</p>
            <p class="value">${payment.receiptNumber}</p>
            <p class="label">Receipt Date</p>
            <p class="value">${receiptDate}</p>
            <p class="label">Issued By</p>
            <p class="value">${payment.issuedBy || 'STAFF'}</p>
          </div>

          <div class="section">
            <p class="label">Reservation Number</p>
            <p class="value">${reservationNumber}</p>
            <p class="label">Guest Name</p>
            <p class="value">${guestName}</p>
            <p class="label">Payment Number</p>
            <p class="value">${payment.paymentNumber}</p>
            <p class="label">Payment Method</p>
            <p class="value">${payment.paymentMethod}</p>
            <p class="label">Amount</p>
            <p class="value">${formatMoney(Number(payment.amountPaid || 0))}</p>
          </div>
        </body>
      </html>
    `;
  };

  const generateOfficialReceipt = async (paymentId: string) => {
    if (!editingReservation) return;

    setPaymentActionId(paymentId);
    setPaymentActionType('GENERATE_RECEIPT');
    setPaymentsSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/reservations/${editingReservation._id}/payments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'GENERATE_RECEIPT',
          paymentId,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to generate official receipt.');
      }

      const generatedReceipt: PaymentRecord = {
        _id: String(data?.payment?._id || paymentId),
        paymentNumber: String(data?.payment?.paymentNumber || ''),
        paymentDate: String(data?.payment?.paymentDate || ''),
        paymentMethod: (String(data?.payment?.paymentMethod || 'CASH_ON_ARRIVAL') === 'GCASH' ? 'GCASH' : 'CASH_ON_ARRIVAL'),
        referenceNumber: String(data?.payment?.referenceNumber || ''),
        amountPaid: Number(data?.payment?.amountPaid || 0),
        balanceRemaining: Number(data?.payment?.balanceRemaining || 0),
        paymentType: (String(data?.payment?.paymentType || 'PARTIAL_PAYMENT') as PaymentType),
        paymentStatus: (String(data?.payment?.paymentStatus || 'UNPAID') as ReservationPaymentStatus),
        receivedBy: String(data?.payment?.receivedBy || 'STAFF'),
        receiptNumber: String(data?.payment?.receiptNumber || ''),
        receiptDate: data?.payment?.receiptDate ? String(data.payment.receiptDate) : null,
        issuedBy: data?.payment?.issuedBy ? String(data.payment.issuedBy) : null,
        notes: data?.payment?.notes ? String(data.payment.notes) : undefined,
        proofOfPaymentUrl: data?.payment?.proofOfPaymentUrl ? String(data.payment.proofOfPaymentUrl) : undefined,
      };

      if (!generatedReceipt.receiptNumber) {
        throw new Error('Receipt generation did not return a valid receipt number.');
      }

      setSelectedReceipt(generatedReceipt);

      // Refresh payment list in the background.
      void loadReservationPayments(editingReservation._id);
      setMessage(typeof data?.message === 'string' ? data.message : 'Official receipt generated successfully.');
      setMessageType('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to generate official receipt.');
      setMessageType('error');
    } finally {
      setPaymentsSaving(false);
      setPaymentActionId(null);
      setPaymentActionType(null);
    }
  };

  const reprintReceipt = (payment: PaymentRecord) => {
    if (!editingReservation || !payment.receiptNumber) return;

    const html = buildReceiptHtml(payment);
    if (!html) {
      setMessage('Unable to prepare receipt for printing.');
      setMessageType('error');
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const printFrame = iframe.contentWindow;
    if (!printFrame) {
      document.body.removeChild(iframe);
      setMessage('Unable to initialize print frame.');
      setMessageType('error');
      return;
    }

    printFrame.document.open();
    printFrame.document.write(html);
    printFrame.document.close();
    printFrame.focus();
    printFrame.print();

    window.setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 1000);
  };

  const openWalkInBooking = async () => {
    setWalkInOpen(true);
    setWalkInLoading(true);

    try {
      const response = await fetch('/api/reservations/rooms', { credentials: 'same-origin' });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to load room options for walk-in booking.');
      }

      setWalkInRooms(Array.isArray(data?.rooms) ? data.rooms : []);
    } catch (error) {
      setWalkInRooms([]);
      setMessage(error instanceof Error ? error.message : 'Unable to load room options for walk-in booking.');
      setMessageType('error');
    } finally {
      setWalkInLoading(false);
    }
  };

  if (!active) return null;

  if (viewMode === 'calendar') {
    return (
      <>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Back to Reservation List
          </button>
        </div>
        <ReservationCalendar />
      </>
    );
  }

  return (
    <section className="mt-4 rounded-3xl border border-slate-800 bg-linear-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/30">
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-800 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">Reservation Management</p>
          <h2 className="text-2xl font-semibold text-white">Review public reservation requests</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { void openWalkInBooking(); }}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Walk-In Booking
          </button>
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Open Monthly Calendar
          </button>
        </div>
      </div>

      {message ? (
        <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${messageType === 'success' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : messageType === 'error' ? 'border-rose-500/20 bg-rose-500/10 text-rose-300' : 'border-sky-500/20 bg-sky-500/10 text-sky-300'}`}>
          {message}
        </div>
      ) : null}

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search reservation no, guest, email, phone"
            className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 sm:w-72"
          />

          <select
            value={reservationStatusFilter}
            onChange={(event) => {
              setReservationStatusFilter(event.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 sm:w-52"
          >
            <option value="ALL">All Reservation Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CHECKED_IN">Checked In</option>
            <option value="CHECKED_OUT">Checked Out</option>
            <option value="NO_SHOW">No Show</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <select
            value={paymentStatusFilter}
            onChange={(event) => {
              setPaymentStatusFilter(event.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 sm:w-52"
          >
            <option value="ALL">All Payment Statuses</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PENDING_VERIFICATION">Pending Verification</option>
            <option value="PARTIALLY_PAID">Partially Paid</option>
            <option value="PAID">Paid</option>
            <option value="REFUNDED">Refunded</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (nextValue === 'ALL' || nextValue === 'ONLINE' || nextValue === 'WALK_IN') {
                setSourceFilter(nextValue);
                setPage(1);
              }
            }}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 sm:w-40"
          >
            <option value="ALL">All Sources</option>
            <option value="ONLINE">Online</option>
            <option value="WALK_IN">Walk-In</option>
          </select>

          <input
            type="date"
            value={startDateFilter}
            onChange={(event) => {
              setStartDateFilter(event.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 sm:w-44"
            aria-label="Start date"
          />

          <input
            type="date"
            value={endDateFilter}
            onChange={(event) => {
              setEndDateFilter(event.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 sm:w-44"
            aria-label="End date"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            setPage(1);
            loadReservations();
          }}
          className="self-start whitespace-nowrap rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 lg:self-auto"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">Loading reservations...</div>
      ) : filteredReservations.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-10 text-center text-sm text-slate-400">No reservations found.</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm text-slate-300">
              <thead className="bg-slate-900/70 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-3">Reservation No.</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">Guest</th>
                  <th className="px-3 py-3">Room</th>
                  <th className="px-3 py-3">Promo</th>
                  <th className="px-3 py-3">Check In</th>
                  <th className="px-3 py-3">Check Out</th>
                  <th className="px-3 py-3">Grand Total</th>
                  <th className="px-3 py-3">Reservation Status</th>
                  <th className="px-3 py-3">Payment Status</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {pagedReservations.map((reservation) => (
                  <tr key={reservation._id} className="hover:bg-slate-900/60">
                    <td className="px-3 py-3 font-semibold text-white">{reservation.reservationNumber}</td>
                    <td className="px-3 py-3">
                      {normalizeReservationSource(reservation.reservationSource) === 'WALK_IN' ? (
                        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300">WALK_IN</span>
                      ) : (
                        <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-300">ONLINE</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-white">{reservation.guestName}</div>
                      <div className="text-xs text-slate-400">{reservation.email}</div>
                      <div className="text-xs text-slate-500">{reservation.phone}</div>
                    </td>
                    <td className="px-3 py-3">{reservation.room?.name || '—'}</td>
                    <td className="px-3 py-3">{reservation.promo?.name || '—'}</td>
                    <td className="px-3 py-3">{formatDate(reservation.checkIn)}</td>
                    <td className="px-3 py-3">{formatDate(reservation.checkOut)}</td>
                    <td className="px-3 py-3 font-semibold text-emerald-300">PHP {(reservation.pricingSummary?.grandTotal || 0).toFixed(2)}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${RESERVATION_STATUS_STYLES[reservation.reservationStatus]}`}>
                        {reservation.reservationStatus.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${PAYMENT_STATUS_STYLES[reservation.paymentStatus]}`}>
                        {reservation.paymentStatus.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={processingId === reservation._id}
                          onClick={() => openEditForm(reservation)}
                          className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                        >
                          Manage
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
            <div>
              Showing {filteredReservations.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, filteredReservations.length)} of {filteredReservations.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 disabled:opacity-40"
              >
                Prev
              </button>
              <span>
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {editingReservation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Edit Reservation {editingReservation.reservationNumber}</h3>
              <button
                type="button"
                onClick={() => setEditingReservation(null)}
                className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <input value={editForm.guestName} onChange={(event) => setEditForm((current) => ({ ...current, guestName: event.target.value }))} placeholder="Guest Name" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
              <input value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
              <input value={editForm.phone} onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
              <input value={editForm.address} onChange={(event) => setEditForm((current) => ({ ...current, address: event.target.value }))} placeholder="Address" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
              <select
                value={editForm.reservationStatus}
                onChange={(event) => {
                  const value = event.target.value;
                  if (
                    value === 'PENDING' ||
                    value === 'CONFIRMED' ||
                    value === 'CHECKED_IN' ||
                    value === 'CHECKED_OUT' ||
                    value === 'NO_SHOW' ||
                    value === 'CANCELLED'
                  ) {
                    setEditForm((current) => ({ ...current, reservationStatus: value }));
                  }
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              >
                {(editingReservation
                  ? [editingReservation.reservationStatus, ...STATUS_TRANSITIONS[editingReservation.reservationStatus]]
                  : ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'NO_SHOW', 'CANCELLED']
                )
                  .filter((status, index, list) => list.indexOf(status) === index)
                  .map((status) => (
                    <option key={status} value={status}>
                      {status.replace('_', ' ')}
                    </option>
                  ))}
              </select>
              <select
                value={editForm.paymentStatus}
                onChange={(event) => {
                  const value = event.target.value;
                  if (
                    value === 'UNPAID' ||
                    value === 'PENDING_VERIFICATION' ||
                    value === 'PARTIALLY_PAID' ||
                    value === 'PAID' ||
                    value === 'REFUNDED'
                  ) {
                    setEditForm((current) => ({ ...current, paymentStatus: value }));
                  }
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              >
                <option value="UNPAID">Unpaid</option>
                <option value="PENDING_VERIFICATION">Pending Verification</option>
                <option value="PARTIALLY_PAID">Partially Paid</option>
                <option value="PAID">Paid</option>
                <option value="REFUNDED">Refunded</option>
              </select>
              <input type="date" value={editForm.checkIn} onChange={(event) => setEditForm((current) => ({ ...current, checkIn: event.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
              <input type="date" value={editForm.checkOut} onChange={(event) => setEditForm((current) => ({ ...current, checkOut: event.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
              <input type="number" min={1} value={editForm.adults} onChange={(event) => setEditForm((current) => ({ ...current, adults: event.target.value }))} placeholder="Adults" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
              <input type="number" min={0} value={editForm.children} onChange={(event) => setEditForm((current) => ({ ...current, children: event.target.value }))} placeholder="Children" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
            </div>

            <textarea value={editForm.specialRequests} onChange={(event) => setEditForm((current) => ({ ...current, specialRequests: event.target.value }))} rows={3} placeholder="Special Requests" className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />

            {editingReservation.pricingSummary ? (
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Pricing Summary</p>
                <div className="mt-2 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                  <p>Room Rate ({editingReservation.pricingSummary.numberOfNights} night{editingReservation.pricingSummary.numberOfNights === 1 ? '' : 's'}): <span className="text-white">PHP {editingReservation.pricingSummary.roomRate.toFixed(2)}</span></p>
                  <p>Extra Person Fee: <span className="text-white">PHP {editingReservation.pricingSummary.extraPersonFee.toFixed(2)}</span></p>
                  <p>Extra Bed Fee: <span className="text-white">PHP {editingReservation.pricingSummary.extraBedFee.toFixed(2)}</span></p>
                  <p>Promo Discount: <span className="text-emerald-300">- PHP {editingReservation.pricingSummary.promoDiscount.toFixed(2)}</span></p>
                  <p>Additional Room Discount: <span className="text-emerald-300">- PHP {editingReservation.pricingSummary.additionalRoomDiscount.toFixed(2)}</span></p>
                  <p>Subtotal: <span className="text-white">PHP {editingReservation.pricingSummary.subtotal.toFixed(2)}</span></p>
                  <p className="sm:col-span-2 text-base font-semibold">Grand Total: <span className="text-emerald-300">PHP {editingReservation.pricingSummary.grandTotal.toFixed(2)}</span></p>
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Check-In / Check-Out Audit</p>
              <p className="mt-2">Check-In Timestamp: <span className="text-white">{editingReservation.checkInAt ? formatDate(editingReservation.checkInAt) : '—'}</span></p>
              <p>Checked-In By: <span className="text-white">{editingReservation.checkedInBy || '—'}</span></p>
              <p className="mt-2">Check-Out Timestamp: <span className="text-white">{editingReservation.checkOutAt ? formatDate(editingReservation.checkOutAt) : '—'}</span></p>
              <p>Checked-Out By: <span className="text-white">{editingReservation.checkedOutBy || '—'}</span></p>
            </div>

            {editingReservation.promo?.inclusions && editingReservation.promo.inclusions.length > 0 ? (
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Promo Inclusions</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-300">
                  {editingReservation.promo.inclusions.map((inclusion, index) => (
                    <li key={inclusion._id || `${editingReservation.promo?._id || 'promo'}-${index}`}>
                      {(inclusion.quantity && inclusion.quantity > 1 ? `${inclusion.quantity}x ` : '') + (inclusion.name || 'Inclusion')}
                      {inclusion.description ? ` - ${inclusion.description}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Payments</p>
                {paymentsLoading ? <span className="text-xs text-slate-400">Loading...</span> : null}
              </div>

              <div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                <p>Total Due: <span className="text-white">{formatMoney(Number(editingReservation.pricingSummary?.grandTotal || paymentSummary?.totalDue || 0))}</span></p>
                <p>Recognized Paid: <span className="text-emerald-300">{formatMoney(Number(paymentSummary?.recognizedPaid || 0))}</span></p>
                <p>Outstanding Balance: <span className="text-amber-300">{formatMoney(Number(paymentSummary?.outstandingBalance || editingReservation.pricingSummary?.grandTotal || 0))}</span></p>
                <p>Pending Verifications: <span className="text-sky-300">{Number(paymentSummary?.pendingCount || 0)}</span></p>
              </div>

              <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-400">Record Payment</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <select
                    value={paymentForm.paymentMethod}
                    onChange={(event) => setPaymentForm((current) => ({ ...current, paymentMethod: event.target.value === 'GCASH' ? 'GCASH' : 'CASH_ON_ARRIVAL' }))}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                  >
                    <option value="CASH_ON_ARRIVAL">Cash on Arrival</option>
                    <option value="GCASH">GCash</option>
                  </select>
                  <select
                    value={paymentForm.paymentType}
                    onChange={(event) => setPaymentForm((current) => ({ ...current, paymentType: event.target.value as PaymentType }))}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                  >
                    <option value="RESERVATION_DEPOSIT">Reservation Deposit</option>
                    <option value="PARTIAL_PAYMENT">Partial Payment</option>
                    <option value="FULL_PAYMENT">Full Payment</option>
                    <option value="REFUND">Refund</option>
                  </select>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={paymentForm.amountPaid}
                    onChange={(event) => setPaymentForm((current) => ({ ...current, amountPaid: event.target.value }))}
                    placeholder="Amount"
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                  />
                  <input
                    value={paymentForm.referenceNumber}
                    onChange={(event) => setPaymentForm((current) => ({ ...current, referenceNumber: event.target.value }))}
                    placeholder="Reference Number (GCash required)"
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                  />
                  <input
                    value={paymentForm.proofOfPaymentUrl}
                    onChange={(event) => setPaymentForm((current) => ({ ...current, proofOfPaymentUrl: event.target.value }))}
                    placeholder="Proof URL (optional)"
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                  />
                  <input
                    value={paymentForm.notes}
                    onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Notes (optional)"
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={paymentsSaving || paymentsLoading || paymentActionId !== null}
                    onClick={() => { void submitPaymentRecord(); }}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {paymentsSaving && paymentActionId === null ? 'Recording...' : 'Record Payment'}
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
                <table className="min-w-full divide-y divide-slate-800 text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/70 uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Payment No.</th>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Method</th>
                      <th className="px-2 py-2">Type</th>
                      <th className="px-2 py-2">Amount</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Reference</th>
                      <th className="px-2 py-2">Receipt No.</th>
                      <th className="px-2 py-2">Issued By</th>
                      <th className="px-2 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-2 py-4 text-center text-slate-500">No payment records yet.</td>
                      </tr>
                    ) : (
                      payments.map((payment) => (
                        <tr key={payment._id}>
                          <td className="px-2 py-2 text-white">{payment.paymentNumber}</td>
                          <td className="px-2 py-2">{formatDate(payment.paymentDate)}</td>
                          <td className="px-2 py-2">{payment.paymentMethod}</td>
                          <td className="px-2 py-2">{payment.paymentType}</td>
                          <td className="px-2 py-2 text-emerald-300">{formatMoney(Number(payment.amountPaid || 0))}</td>
                          <td className="px-2 py-2">{payment.paymentStatus}</td>
                          <td className="px-2 py-2">{payment.referenceNumber || '—'}</td>
                          <td className="px-2 py-2 text-emerald-200">{payment.receiptNumber || '—'}</td>
                          <td className="px-2 py-2">{payment.issuedBy || '—'}</td>
                          <td className="px-2 py-2">
                            <div className="flex flex-wrap gap-1">
                              {payment.paymentMethod === 'GCASH' && payment.paymentStatus === 'PENDING_VERIFICATION' ? (
                                <button
                                  type="button"
                                  disabled={paymentsSaving || paymentActionId === payment._id}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void updatePaymentStatus(payment._id, 'PAID');
                                  }}
                                  className="rounded border border-emerald-700/40 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-900/20 disabled:opacity-40"
                                >
                                  {paymentActionId === payment._id && paymentActionType === 'VERIFY' ? 'Verifying...' : 'Verify'}
                                </button>
                              ) : null}
                              {payment.paymentMethod === 'GCASH' && payment.paymentStatus === 'PENDING_VERIFICATION' ? (
                                <button
                                  type="button"
                                  disabled={paymentsSaving || paymentActionId === payment._id}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void updatePaymentStatus(payment._id, 'REFUNDED');
                                  }}
                                  className="rounded border border-rose-700/40 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-900/20 disabled:opacity-40"
                                >
                                  {paymentActionId === payment._id && paymentActionType === 'REJECT' ? 'Rejecting...' : 'Reject'}
                                </button>
                              ) : null}
                              {(payment.paymentStatus === 'PAID' || payment.paymentStatus === 'PARTIALLY_PAID') && !payment.receiptNumber ? (
                                <button
                                  type="button"
                                  disabled={paymentsSaving || paymentActionId === payment._id}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void generateOfficialReceipt(payment._id);
                                  }}
                                  className="rounded border border-cyan-700/40 px-2 py-1 text-[11px] text-cyan-300 hover:bg-cyan-900/20 disabled:opacity-40"
                                >
                                  {paymentActionId === payment._id && paymentActionType === 'GENERATE_RECEIPT' ? 'Generating...' : 'Generate Receipt'}
                                </button>
                              ) : null}
                              {payment.receiptNumber ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setSelectedReceipt(payment);
                                  }}
                                  className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                                >
                                  View Receipt
                                </button>
                              ) : null}
                              {payment.receiptNumber ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    reprintReceipt(payment);
                                  }}
                                  className="rounded border border-emerald-700/40 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-900/20"
                                >
                                  Reprint Receipt
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingReservation(null)}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void handleSaveEdit(); }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedReceipt && editingReservation ? (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Official Receipt Preview</h3>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Official Receipt</p>
              <p>Receipt Number: <span className="text-white">{selectedReceipt.receiptNumber || '—'}</span></p>
              <p>Receipt Date: <span className="text-white">{selectedReceipt.receiptDate ? formatDate(selectedReceipt.receiptDate) : formatDate(selectedReceipt.paymentDate)}</span></p>
              <p>Issued By: <span className="text-white">{selectedReceipt.issuedBy || '—'}</span></p>
              <hr className="border-slate-800" />
              <p>Reservation Number: <span className="text-white">{editingReservation.reservationNumber}</span></p>
              <p>Guest Name: <span className="text-white">{editingReservation.guestName}</span></p>
              <p>Payment Number: <span className="text-white">{selectedReceipt.paymentNumber}</span></p>
              <p>Payment Method: <span className="text-white">{selectedReceipt.paymentMethod}</span></p>
              <p>Payment Status: <span className="text-white">{selectedReceipt.paymentStatus}</span></p>
              <p>Amount: <span className="text-emerald-300">{formatMoney(Number(selectedReceipt.amountPaid || 0))}</span></p>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => reprintReceipt(selectedReceipt)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Reprint Receipt
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {walkInOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4">
          <div className="mx-auto w-full max-w-4xl py-4">
            {walkInLoading ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">Loading room options...</div>
            ) : (
              <ReservationForm
                rooms={walkInRooms}
                mode="walk-in"
                onCancel={() => setWalkInOpen(false)}
                onSuccess={(reservationNumber) => {
                  setWalkInOpen(false);
                  setMessage(`Walk-in booking ${reservationNumber} created successfully.`);
                  setMessageType('success');
                  setPage(1);
                  void loadReservations();
                }}
              />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
