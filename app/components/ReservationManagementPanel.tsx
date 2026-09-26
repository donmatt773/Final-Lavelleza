'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReservationCalendar from '@/app/components/ReservationCalendar';
import ReservationForm from '@/app/components/ReservationForm';
import { readGcashReceiptDetails, uploadPaymentReceipt } from '@/app/lib/paymentReceiptClient';
import { DashboardReservationEvent, useDashboardReservationRealtime } from '@/hooks/useDashboardReservationRealtime';

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
  addOnTotal: number;
  addOns: Array<{
    addOnId: string;
    quantity: number;
    name: string;
    unitPrice: number;
    totalPrice: number;
  }>;
  promoDiscount: number;
  additionalRoomDiscount: number;
  subtotal: number;
  grandTotal: number;
  roomBreakdown?: Array<{
    roomId: string;
    roomName: string;
    adults: number;
    children: number;
    roomRate: number;
    packageRoom: boolean;
    additionalRoomDiscount: number;
    extraPersonFee: number;
    extraBedFee: number;
  }>;
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
  roomAssignments?: Array<{
    room?: { _id?: string; name?: string; code?: string } | string | null;
    adults: number;
    children: number;
  }>;
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
  addOns?: Array<{
    addOnId: string;
    quantity: number;
    name: string;
    unitPrice: number;
    totalPrice: number;
  }>;
  reservationSource?: ReservationSource;
  reservationStatus: ReservationStatus;
  paymentStatus: ReservationPaymentStatus;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  checkedInBy?: string | null;
  checkedOutBy?: string | null;
  pricingSummary?: ReservationPricingSummary;
};

function getReservationRoomLabel(reservation: ReservationRecord) {
  const assignedRooms = reservation.roomAssignments?.map((assignment) => (
    typeof assignment.room === 'string' ? 'Room' : assignment.room?.name || 'Room'
  )) || [];
  return assignedRooms.length > 0 ? assignedRooms.join(', ') : reservation.room?.name || '—';
}

type Props = {
  active: boolean;
  canManageGmail?: boolean;
};

type RoomOption = {
  _id: string;
  name: string;
  code: string;
};

const PAGE_SIZE = 8;
const SEEN_RESERVATION_NOTIFICATIONS_KEY = 'lavelleza-seen-reservation-notifications';

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

const getNextDateInputValue = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

function playReservationNotificationSound(context: AudioContext) {
  if (context.state !== 'running') return;

  const now = context.currentTime;
  const masterGain = context.createGain();
  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.exponentialRampToValueAtTime(0.12, now + 0.025);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
  masterGain.connect(context.destination);

  [880, 1174.66].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const start = now + index * 0.14;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.connect(masterGain);
    oscillator.start(start);
    oscillator.stop(start + 0.24);
  });
}

export default function ReservationManagementPanel({ active, canManageGmail = false }: Props) {
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
  const [extendingReservation, setExtendingReservation] = useState<ReservationRecord | null>(null);
  const [extensionCheckOut, setExtensionCheckOut] = useState('');
  const [extensionPricing, setExtensionPricing] = useState<ReservationPricingSummary | null>(null);
  const [extensionCurrentPricing, setExtensionCurrentPricing] = useState<ReservationPricingSummary | null>(null);
  const [extensionPricingLoading, setExtensionPricingLoading] = useState(false);
  const [extensionSaving, setExtensionSaving] = useState(false);
  const [checkoutWarningOpen, setCheckoutWarningOpen] = useState(false);
  const [checkoutWarningBalance, setCheckoutWarningBalance] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInLoading, setWalkInLoading] = useState(false);
  const [walkInRooms, setWalkInRooms] = useState<RoomOption[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [seenReservationIds, setSeenReservationIds] = useState<string[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const handledNotificationIdsRef = useRef<Set<string>>(new Set());
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsSaving, setPaymentsSaving] = useState(false);
  const [paymentActionId, setPaymentActionId] = useState<string | null>(null);
  const [paymentActionType, setPaymentActionType] = useState<'VERIFY' | 'REJECT' | 'GENERATE_RECEIPT' | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
    const [receiptProcessing, setReceiptProcessing] = useState(false);
    const [receiptProgress, setReceiptProgress] = useState(0);
    const [receiptMessage, setReceiptMessage] = useState<string | null>(null);
    const receiptInputRef = useRef<HTMLInputElement>(null);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(null);
  const [receiptEmailSendingId, setReceiptEmailSendingId] = useState<string | null>(null);
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; email: string | null }>({ connected: false, email: null });
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailActionLoading, setGmailActionLoading] = useState(false);
  const [emailSendingId, setEmailSendingId] = useState<string | null>(null);
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
    checkIn: '',
    checkOut: '',
    adults: '1',
    children: '0',
    roomAssignments: [] as Array<{ roomId: string; roomName: string; adults: string; children: string }>,
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

  const loadGmailStatus = React.useCallback(async () => {
    setGmailLoading(true);
    try {
      const response = await fetch('/api/gmail/status', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error('Unable to check Gmail connection.');
      setGmailStatus({ connected: Boolean(data.connected), email: typeof data.email === 'string' ? data.email : null });
    } catch {
      setGmailStatus({ connected: false, email: null });
    } finally {
      setGmailLoading(false);
    }
  }, []);

  const disconnectGmail = async () => {
    setGmailActionLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/gmail/status', { method: 'DELETE', credentials: 'same-origin' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.message || 'Unable to disconnect Gmail.');
      setGmailStatus({ connected: false, email: null });
      setMessage('Gmail account disconnected.');
      setMessageType('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to disconnect Gmail.');
      setMessageType('error');
    } finally {
      setGmailActionLoading(false);
    }
  };

  const sendReservationEmail = async (reservation: ReservationRecord) => {
    if (!window.confirm(`Send a generated reservation email to ${reservation.email}?`)) return;
    setEmailSendingId(reservation._id);
    setMessage(null);
    try {
      const response = await fetch(`/api/reservations/${reservation._id}/email`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.message || 'Unable to send customer email.');
      setMessage(data.message || 'Customer email sent.');
      setMessageType('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to send customer email.');
      setMessageType('error');
    } finally {
      setEmailSendingId(null);
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
      checkIn: reservation.checkIn ? new Date(reservation.checkIn).toISOString().slice(0, 10) : '',
      checkOut: reservation.checkOut ? new Date(reservation.checkOut).toISOString().slice(0, 10) : '',
      adults: String(reservation.adults ?? 1),
      children: String(reservation.children ?? 0),
      roomAssignments: reservation.roomAssignments?.length
        ? reservation.roomAssignments.map((assignment) => ({
            roomId: typeof assignment.room === 'string' ? assignment.room : String(assignment.room?._id || ''),
            roomName: typeof assignment.room === 'string' ? 'Room' : String(assignment.room?.name || 'Room'),
            adults: String(assignment.adults ?? 1),
            children: String(assignment.children ?? 0),
          }))
        : reservation.room?._id
          ? [{ roomId: reservation.room._id, roomName: reservation.room.name || 'Room', adults: String(reservation.adults ?? 1), children: String(reservation.children ?? 0) }]
          : [],
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
    setReceiptMessage(null);
    setReceiptProgress(0);

    void loadReservationPayments(reservation._id);
  };

  const openExtendStay = (reservation: ReservationRecord) => {
    setExtendingReservation(reservation);
    setExtensionCheckOut(getNextDateInputValue(reservation.checkOut));
    setExtensionPricing(null);
    setExtensionCurrentPricing(null);
  };

  const previewExtensionPricing = async () => {
    if (!extendingReservation || !extensionCheckOut) return;

    setExtensionPricingLoading(true);
    setMessage(null);
    try {
      const pricingRequest = (checkOut: string) => fetch('/api/reservations/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          reservationId: extendingReservation._id,
          room: extendingReservation.room?._id,
          roomAssignments: extendingReservation.roomAssignments?.map((assignment) => ({
            room: typeof assignment.room === 'string' ? assignment.room : assignment.room?._id,
            adults: assignment.adults,
            children: assignment.children,
          })),
          promo: extendingReservation.promo?._id || null,
          checkIn: extendingReservation.checkIn,
          checkOut,
          adults: extendingReservation.adults,
          children: extendingReservation.children,
          addOns: (extendingReservation.addOns || []).map((addOn) => ({ addOnId: addOn.addOnId, quantity: addOn.quantity })),
        }),
      });

      const [currentResponse, extensionResponse] = await Promise.all([
        pricingRequest(new Date(extendingReservation.checkOut).toISOString().slice(0, 10)),
        pricingRequest(extensionCheckOut),
      ]);
      const [currentData, extensionData] = await Promise.all([
        currentResponse.json().catch(() => null),
        extensionResponse.json().catch(() => null),
      ]);
      if (!currentResponse.ok || !currentData?.success || !extensionResponse.ok || !extensionData?.success) {
        const data = !currentResponse.ok || !currentData?.success ? currentData : extensionData;
        throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to calculate the extended stay price.');
      }
      setExtensionCurrentPricing(currentData.pricingSummary as ReservationPricingSummary);
      setExtensionPricing(extensionData.pricingSummary as ReservationPricingSummary);
    } catch (error) {
      setExtensionPricing(null);
      setMessage(error instanceof Error ? error.message : 'Unable to calculate the extended stay price.');
      setMessageType('error');
    } finally {
      setExtensionPricingLoading(false);
    }
  };

  const saveExtension = async () => {
    if (!extendingReservation || !extensionCheckOut) return;

    setExtensionSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/reservations/${extendingReservation._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ checkOut: extensionCheckOut }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const errors = Array.isArray(data?.errors) ? ` ${data.errors.join(' ')}` : '';
        throw new Error(`${typeof data?.message === 'string' ? data.message : 'Unable to extend the reservation.'}${errors}`.trim());
      }

      setExtendingReservation(null);
      setExtensionPricing(null);
      setExtensionCurrentPricing(null);
      setMessage('Reservation stay extended successfully.');
      setMessageType('success');
      await loadReservations();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to extend the reservation.');
      setMessageType('error');
    } finally {
      setExtensionSaving(false);
    }
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

  const handleNewReservationEvent = React.useCallback((event: DashboardReservationEvent) => {
    const reservationId = event.reservationId;
    if (!reservationId || event.reservationStatus !== 'PENDING' || event.reservationSource !== 'ONLINE') return;
    if (handledNotificationIdsRef.current.has(reservationId)) return;
    handledNotificationIdsRef.current.add(reservationId);

    try {
      const seenIds = JSON.parse(window.localStorage.getItem(SEEN_RESERVATION_NOTIFICATIONS_KEY) || '[]');
      if (Array.isArray(seenIds) && seenIds.includes(reservationId)) return;
    } catch {
      // A malformed notification cache must not prevent the new-request chime.
    }

    if (audioContextRef.current) playReservationNotificationSound(audioContextRef.current);
  }, []);

  useDashboardReservationRealtime(loadReservations, handleNewReservationEvent);

  useEffect(() => {
    const unlockNotificationAudio = () => {
      try {
        const AudioContextConstructor = window.AudioContext;
        if (!AudioContextConstructor) return;
        const context = audioContextRef.current || new AudioContextConstructor();
        audioContextRef.current = context;
        if (context.state === 'suspended') void context.resume().catch(() => undefined);
      } catch {
        audioContextRef.current = null;
      }
    };

    document.addEventListener('pointerdown', unlockNotificationAudio);
    document.addEventListener('keydown', unlockNotificationAudio);

    return () => {
      document.removeEventListener('pointerdown', unlockNotificationAudio);
      document.removeEventListener('keydown', unlockNotificationAudio);
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => undefined);
        audioContextRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(SEEN_RESERVATION_NOTIFICATIONS_KEY);
        const parsed = stored ? JSON.parse(stored) : [];
        if (Array.isArray(parsed)) {
          setSeenReservationIds(parsed.filter((id): id is string => typeof id === 'string'));
        }
      } catch {
        setSeenReservationIds([]);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!active) return;

    const timeoutId = window.setTimeout(() => {
      void loadReservations();
      setPage(1);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [active, loadReservations]);

  useEffect(() => {
    if (!active) return;
    const timeoutId = window.setTimeout(() => {
      void loadGmailStatus();
      const url = new URL(window.location.href);
      const result = url.searchParams.get('gmail');
      if (result === 'connected') {
        setMessage('Gmail account connected. Reservation emails are ready to send.');
        setMessageType('success');
      } else if (result === 'error') {
        setMessage('Gmail could not be connected. Check the Google OAuth setup and try again.');
        setMessageType('error');
      }
      if (result) {
        url.searchParams.delete('gmail');
        window.history.replaceState(window.history.state, '', url);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [active, loadGmailStatus]);

  const filteredReservations = useMemo(() => {
    if (sourceFilter === 'ALL') return reservations;
    return reservations.filter((reservation) => normalizeReservationSource(reservation.reservationSource) === sourceFilter);
  }, [reservations, sourceFilter]);

  const unseenReservations = useMemo(
    () => reservations.filter((reservation) => (
      reservation.reservationStatus === 'PENDING'
      && normalizeReservationSource(reservation.reservationSource) === 'ONLINE'
      && !seenReservationIds.includes(reservation._id)
    )),
    [reservations, seenReservationIds]
  );

  const markReservationNotificationSeen = (reservationId: string) => {
    setSeenReservationIds((current) => {
      if (current.includes(reservationId)) return current;

      const next = [...current, reservationId];
      window.localStorage.setItem(SEEN_RESERVATION_NOTIFICATIONS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const openReservationNotification = (reservation: ReservationRecord) => {
    markReservationNotificationSeen(reservation._id);
    setNotificationsOpen(false);
    openEditForm(reservation);
  };

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
                roomAssignments: Array.isArray(data?.reservation?.roomAssignments) ? data.reservation.roomAssignments : reservation.roomAssignments,
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

    if (editForm.reservationStatus === 'CHECKED_OUT' && (!paymentSummary || paymentSummary.outstandingBalance > 0.01)) {
      setCheckoutWarningBalance(paymentSummary?.outstandingBalance ?? null);
      setCheckoutWarningOpen(true);
      return;
    }

    await patchReservation(editingReservation._id, {
      guestName: editForm.guestName,
      email: editForm.email,
      phone: editForm.phone,
      address: editForm.address,
      reservationStatus: editForm.reservationStatus,
      checkIn: editForm.checkIn,
      checkOut: editForm.checkOut,
      adults: Number(editForm.adults),
      children: Number(editForm.children),
      roomAssignments: editForm.roomAssignments.map((assignment) => ({
        room: assignment.roomId,
        adults: Number(assignment.adults),
        children: Number(assignment.children),
      })),
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
      if (paymentForm.paymentMethod === 'GCASH' && paymentForm.paymentType !== 'REFUND' && !paymentForm.proofOfPaymentUrl.trim()) {
        throw new Error('Upload the GCash receipt image before recording this payment.');
      }

      const outstandingBalance = Number(paymentSummary?.outstandingBalance || 0);
      const recognizedPaid = Number(paymentSummary?.recognizedPaid || 0);

      if (paymentForm.paymentMethod === 'GCASH' && paymentForm.paymentType !== 'REFUND' && amount > outstandingBalance) {
        throw new Error('GCash payment cannot exceed the outstanding balance.');
      }

      if (paymentForm.paymentType === 'FULL_PAYMENT' && amount + 0.01 < outstandingBalance) {
        throw new Error(`Full payment must be at least the outstanding balance of ${formatMoney(outstandingBalance)}.`);
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
      setReceiptMessage(null);
      setReceiptProgress(0);

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

  const handleGcashReceiptSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setReceiptProcessing(true);
    setReceiptProgress(0);
    setReceiptMessage('Uploading receipt image...');
    setPaymentForm((current) => ({ ...current, amountPaid: '', referenceNumber: '', proofOfPaymentUrl: '' }));
    try {
      const proofOfPaymentUrl = await uploadPaymentReceipt(file);
      setPaymentForm((current) => ({ ...current, proofOfPaymentUrl }));
      setReceiptMessage('Receipt uploaded. Reading reference number...');

      const receiptDetails = await readGcashReceiptDetails(file, setReceiptProgress);
      setPaymentForm((current) => ({
        ...current,
        ...(receiptDetails.referenceNumber ? { referenceNumber: receiptDetails.referenceNumber } : {}),
        ...(receiptDetails.amount ? { amountPaid: receiptDetails.amount } : {}),
      }));
      const detected = [
        receiptDetails.referenceNumber ? 'reference number' : null,
        receiptDetails.amount ? 'amount' : null,
      ].filter(Boolean);
      setReceiptMessage(detected.length > 0
        ? `Receipt ${detected.join(' and ')} detected. Please verify before recording the payment.`
        : 'Receipt uploaded, but the reference number and amount were not detected. Enter them manually and verify against the receipt.');
    } catch (uploadError) {
      setReceiptMessage(uploadError instanceof Error ? uploadError.message : 'Unable to read the receipt image.');
    } finally {
      setReceiptProcessing(false);
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
    const receiptPayments = payments.some((item) => item._id === payment._id) ? payments : [...payments, payment];
    const totalPaid = Number(paymentSummary?.recognizedPaid || 0);
    const totalDue = Number(paymentSummary?.totalDue || editingReservation.pricingSummary?.grandTotal || 0);
    const changeDue = Math.max(totalPaid - totalDue, 0);
    const addOnRows = (editingReservation.pricingSummary?.addOns || []).map((addOn) => `
      <tr><td>${addOn.quantity}x ${addOn.name}</td><td>${formatMoney(Number(addOn.totalPrice || 0))}</td></tr>
    `).join('');
    const paymentRows = receiptPayments.map((item) => `
      <tr>
        <td>${item.paymentNumber || '—'}</td>
        <td>${formatDate(item.paymentDate)}</td>
        <td>${item.paymentMethod}</td>
        <td>${item.paymentType}</td>
        <td>${formatMoney(Number(item.amountPaid || 0))}</td>
        <td>${item.paymentStatus}</td>
      </tr>
    `).join('');

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
            table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
            th, td { border-bottom: 1px solid #e5e7eb; padding: 7px 4px; text-align: left; }
            th { color: #4b5563; font-size: 10px; text-transform: uppercase; }
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
            <p class="label">All Payment Transactions</p>
            <table>
              <thead><tr><th>Payment No.</th><th>Date</th><th>Method</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>${paymentRows}</tbody>
            </table>
            ${addOnRows ? `<p class="label">Reservation Add-Ons</p><table><thead><tr><th>Item</th><th>Total</th></tr></thead><tbody>${addOnRows}</tbody></table>` : ''}
            <p class="label">Total Due</p>
            <p class="value">${formatMoney(totalDue)}</p>
            <p class="label">Total Recognized Paid</p>
            <p class="value">${formatMoney(totalPaid)}</p>
            <p class="label">Change Due</p>
            <p class="value">${formatMoney(changeDue)}</p>
            <p class="label">Remaining Balance</p>
            <p class="value">${formatMoney(Math.max(totalDue - totalPaid, 0))}</p>
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

  const emailOfficialReceipt = async (payment: PaymentRecord) => {
    if (!editingReservation || !payment.receiptNumber) return;
    if (!window.confirm(`Email receipt ${payment.receiptNumber} to ${editingReservation.email}?`)) return;

    setReceiptEmailSendingId(payment._id);
    setMessage(null);
    try {
      const response = await fetch(`/api/reservations/${editingReservation._id}/payments/${payment._id}/email`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to email the official receipt.');
      }
      setMessage(typeof data.message === 'string' ? data.message : 'Official receipt emailed successfully.');
      setMessageType('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to email the official receipt.');
      setMessageType('error');
    } finally {
      setReceiptEmailSendingId(null);
    }
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

  const receiptPayments = selectedReceipt && payments.some((payment) => payment._id === selectedReceipt._id)
    ? payments
    : selectedReceipt
      ? [...payments, selectedReceipt]
      : payments;
  const receiptTotalDue = Number(paymentSummary?.totalDue || editingReservation?.pricingSummary?.grandTotal || 0);
  const receiptTotalPaid = Number(paymentSummary?.recognizedPaid || 0);
  const receiptChangeDue = Math.max(receiptTotalPaid - receiptTotalDue, 0);

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
    <section className="mt-4 rounded-3xl border border-slate-800 bg-linear-to-br from-slate-900 via-slate-900 to-slate-950 p-4 shadow-2xl shadow-black/30 sm:p-6">
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-800 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">Reservation Management</p>
          <h2 className="text-2xl font-semibold text-white">Review public reservation requests</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {gmailLoading ? <span className="text-slate-500">Checking Gmail...</span> : gmailStatus.connected ? (
              <span className="text-emerald-300">Gmail connected: {gmailStatus.email}</span>
            ) : <span className="text-slate-500">Gmail is not connected</span>}
            {canManageGmail ? gmailStatus.connected ? (
              <button
                type="button"
                disabled={gmailActionLoading}
                onClick={() => { void disconnectGmail(); }}
                className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:bg-slate-800 disabled:opacity-50"
              >
                {gmailActionLoading ? 'Disconnecting...' : 'Disconnect'}
              </button>
            ) : (
              <button
                type="button"
                disabled={gmailActionLoading || gmailLoading}
                onClick={() => window.location.assign('/api/gmail/connect')}
                className="rounded border border-emerald-700/50 px-2 py-1 font-semibold text-emerald-300 hover:bg-emerald-900/20 disabled:opacity-50"
              >
                Connect Gmail
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { void openWalkInBooking(); }}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Walk-In Booking
          </button>
          <div className="relative">
            <button
              type="button"
              aria-label="Reservation notifications"
              aria-expanded={notificationsOpen}
              title="Reservation notifications"
              onClick={() => setNotificationsOpen((current) => !current)}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-950/70 text-lg text-slate-200 hover:bg-slate-800"
            >
              <span aria-hidden="true">🔔</span>
              {unseenReservations.length > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-5 text-white">
                  {unseenReservations.length > 99 ? '99+' : unseenReservations.length}
                </span>
              ) : null}
            </button>

            {notificationsOpen ? (
              <div className="absolute right-0 top-12 z-40 w-80 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl shadow-black/40">
                <div className="flex items-center justify-between px-2 py-2">
                  <p className="text-sm font-semibold text-white">New reservation requests</p>
                  <span className="text-xs text-slate-400">{unseenReservations.length} unseen</span>
                </div>
                {unseenReservations.length === 0 ? (
                  <p className="px-2 py-5 text-center text-xs text-slate-400">No unseen reservation requests.</p>
                ) : (
                  <div className="max-h-80 space-y-1 overflow-y-auto">
                    {unseenReservations.map((reservation) => (
                      <button
                        type="button"
                        key={reservation._id}
                        onClick={() => openReservationNotification(reservation)}
                        className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-left hover:border-emerald-500/50 hover:bg-slate-800"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-white">{getReservationRoomLabel(reservation)}</span>
                          <span className="text-[10px] font-semibold uppercase text-amber-300">Pending</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-300">{reservation.guestName}</p>
                        <p className="text-xs text-slate-500">{reservation.reservationNumber}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
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
                    <td className="px-3 py-3">{getReservationRoomLabel(reservation)}</td>
                    <td className="px-3 py-3">{reservation.promo?.name || '—'}</td>
                    <td className="px-3 py-3">{formatDate(reservation.checkIn)}</td>
                    <td className="px-3 py-3">{formatDate(reservation.checkOut)}</td>
                    <td className="px-3 py-3 font-semibold text-emerald-300">{formatMoney(reservation.pricingSummary?.grandTotal || 0)}</td>
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
                        {reservation.reservationStatus !== 'CANCELLED' && reservation.reservationStatus !== 'CHECKED_OUT' ? (
                          <button
                            type="button"
                            onClick={() => openExtendStay(reservation)}
                            className="rounded-lg border border-amber-700/50 px-2 py-1 text-xs text-amber-300 hover:bg-amber-900/20"
                          >
                            Extend Stay
                          </button>
                        ) : null}
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

      {checkoutWarningOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-700/50 bg-slate-900 p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Checkout blocked</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Outstanding balance remains</h3>
            <p className="mt-3 text-sm text-slate-300">
              {checkoutWarningBalance === null
                ? 'Payment information is still loading. Please wait and try again.'
                : `This reservation still has an outstanding balance of ${formatMoney(checkoutWarningBalance)}. Record or verify the remaining payment before checking out.`}
            </p>
            {editingReservation ? (
              <p className="mt-3 text-xs text-slate-500">{editingReservation.reservationNumber} · {editingReservation.guestName}</p>
            ) : null}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setCheckoutWarningOpen(false);
                  setCheckoutWarningBalance(null);
                }}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-500"
              >
                Return to payment section
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {extendingReservation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Extend Stay</p>
                <h3 className="mt-1 text-lg font-semibold text-white">{extendingReservation.reservationNumber}</h3>
                <p className="mt-1 text-sm text-slate-400">{extendingReservation.guestName} · {getReservationRoomLabel(extendingReservation)}</p>
              </div>
              <button
                type="button"
                onClick={() => setExtendingReservation(null)}
                className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-sm text-slate-300">
                Current check-out: <span className="font-semibold text-white">{formatDate(extendingReservation.checkOut)}</span>
              </p>
              <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-400">New check-out date</label>
              <input
                type="date"
                min={getNextDateInputValue(extendingReservation.checkOut)}
                value={extensionCheckOut}
                onChange={(event) => {
                  setExtensionCheckOut(event.target.value);
                  setExtensionPricing(null);
                }}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
              />
              <p className="mt-2 text-xs text-slate-500">The new date must be later than the current check-out date and available for every assigned room.</p>
            </div>

            {extensionPricing ? (
              <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-slate-300">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Updated Pricing</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <p>New room total: <span className="font-semibold text-white">{formatMoney(extensionPricing.roomRate)}</span></p>
                  <p>New grand total: <span className="font-semibold text-emerald-300">{formatMoney(extensionPricing.grandTotal)}</span></p>
                  <p className="sm:col-span-2">Additional amount: <span className="font-semibold text-amber-300">{formatMoney(extensionPricing.grandTotal - Number(extensionCurrentPricing?.grandTotal || 0))}</span></p>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExtendingReservation(null)}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!extensionCheckOut || extensionPricingLoading || extensionSaving}
                onClick={() => { void previewExtensionPricing(); }}
                className="rounded-lg border border-amber-700/50 px-3 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-900/20 disabled:opacity-40"
              >
                {extensionPricingLoading ? 'Checking...' : 'Check Price'}
              </button>
              <button
                type="button"
                disabled={!extensionPricing || extensionSaving}
                onClick={() => { void saveExtension(); }}
                className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-500 disabled:opacity-40"
              >
                {extensionSaving ? 'Saving...' : 'Confirm Extension'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingReservation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Edit Reservation {editingReservation.reservationNumber}</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!gmailStatus.connected || !editingReservation.email || emailSendingId === editingReservation._id}
                  onClick={() => { void sendReservationEmail(editingReservation); }}
                  title={!gmailStatus.connected ? 'Connect Gmail to send reservation emails' : undefined}
                  className="rounded-lg border border-sky-700/50 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {emailSendingId === editingReservation._id ? 'Sending...' : 'Email customer'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingReservation(null)}
                  className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>

            {editingReservation.reservationStatus === 'CHECKED_OUT' ? (
              <div className="mb-4 rounded-lg border border-amber-700/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                This reservation is checked out and locked. Its details are read-only.
              </div>
            ) : null}

            <fieldset disabled={editingReservation.reservationStatus === 'CHECKED_OUT'}>
            <div className="grid gap-3 md:grid-cols-2">
              <input value={editForm.guestName} onChange={(event) => setEditForm((current) => ({ ...current, guestName: event.target.value }))} placeholder="Guest Name" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
              <input value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
              <input value={editForm.phone} onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
              <input value={editForm.address} onChange={(event) => setEditForm((current) => ({ ...current, address: event.target.value }))} placeholder="Address" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
              <input type="date" value={editForm.checkIn} onChange={(event) => setEditForm((current) => ({ ...current, checkIn: event.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
              <input type="date" value={editForm.checkOut} onChange={(event) => setEditForm((current) => ({ ...current, checkOut: event.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
              <div className="md:col-span-2 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Guests per room</p>
                {editForm.roomAssignments.map((assignment, index) => (
                  <div key={assignment.roomId} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                    <p className="mb-2 text-sm font-medium text-white">{assignment.roomName}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-xs text-slate-400">Adults
                        <input type="number" min={1} value={assignment.adults} onChange={(event) => setEditForm((current) => {
                          const roomAssignments = current.roomAssignments.map((room, roomIndex) => roomIndex === index ? { ...room, adults: event.target.value } : room);
                          return { ...current, roomAssignments, adults: String(roomAssignments.reduce((total, room) => total + (Number(room.adults) || 0), 0)) };
                        })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
                      </label>
                      <label className="text-xs text-slate-400">Children
                        <input type="number" min={0} value={assignment.children} onChange={(event) => setEditForm((current) => {
                          const roomAssignments = current.roomAssignments.map((room, roomIndex) => roomIndex === index ? { ...room, children: event.target.value } : room);
                          return { ...current, roomAssignments, children: String(roomAssignments.reduce((total, room) => total + (Number(room.children) || 0), 0)) };
                        })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <textarea value={editForm.specialRequests} onChange={(event) => setEditForm((current) => ({ ...current, specialRequests: event.target.value }))} rows={3} placeholder="Special Requests" className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />

            {editingReservation.pricingSummary ? (
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Pricing Summary</p>
                <div className="mt-2 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                  <p>Room Rate ({editingReservation.pricingSummary.numberOfNights} night{editingReservation.pricingSummary.numberOfNights === 1 ? '' : 's'}): <span className="text-white">{formatMoney(editingReservation.pricingSummary.roomRate)}</span></p>
                  <p>Extra Person Fee: <span className="text-white">{formatMoney(editingReservation.pricingSummary.extraPersonFee)}</span></p>
                  <p>Extra Bed Fee: <span className="text-white">{formatMoney(editingReservation.pricingSummary.extraBedFee)}</span></p>
                  <p>Add-On Total: <span className="text-white">{formatMoney(Number(editingReservation.pricingSummary.addOnTotal || 0))}</span></p>
                  <p>Promo Discount: <span className="text-emerald-300">- {formatMoney(editingReservation.pricingSummary.promoDiscount)}</span></p>
                  <p>Additional Room Discount: <span className="text-emerald-300">- {formatMoney(editingReservation.pricingSummary.additionalRoomDiscount)}</span></p>
                  <p>Subtotal: <span className="text-white">{formatMoney(editingReservation.pricingSummary.subtotal)}</span></p>
                  <p className="sm:col-span-2 text-base font-semibold">Grand Total: <span className="text-emerald-300">{formatMoney(editingReservation.pricingSummary.grandTotal)}</span></p>
                </div>
                {editingReservation.pricingSummary.addOns?.length > 0 ? (
                  <ul className="mt-3 space-y-1 border-t border-slate-800 pt-3 text-sm text-slate-300">
                    {editingReservation.pricingSummary.addOns.map((addOn) => <li key={addOn.addOnId}>{addOn.quantity}x {addOn.name} - {formatMoney(addOn.totalPrice)}</li>)}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Check-In / Check-Out Audit</p>
              <label className="mt-3 block text-xs uppercase tracking-wider text-slate-400">Reservation Status</label>
              <select
                value={editForm.reservationStatus}
                onChange={(event) => {
                  const nextStatus = event.target.value as ReservationStatus;
                  if (nextStatus === 'CHECKED_OUT' && (!paymentSummary || paymentSummary.outstandingBalance > 0.01)) {
                    setCheckoutWarningBalance(paymentSummary?.outstandingBalance ?? null);
                    setCheckoutWarningOpen(true);
                    return;
                  }
                  setEditForm((current) => ({ ...current, reservationStatus: nextStatus }));
                }}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              >
                {[editingReservation.reservationStatus, ...STATUS_TRANSITIONS[editingReservation.reservationStatus]]
                  .filter((status, index, list) => list.indexOf(status) === index)
                  .map((status) => (
                    <option key={status} value={status}>
                      {status.replace('_', ' ')}
                    </option>
                  ))}
              </select>
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
                <p>Outstanding Balance: <span className="text-amber-300">{formatMoney(Number(paymentSummary?.outstandingBalance ?? editingReservation.pricingSummary?.grandTotal ?? 0))}</span></p>
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
                  {paymentForm.paymentMethod === 'GCASH' ? (
                    <>
                      <div className="md:col-span-2">
                        <input
                          ref={receiptInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          disabled={receiptProcessing || paymentsSaving}
                          onChange={(event) => { void handleGcashReceiptSelected(event); }}
                        />
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => receiptInputRef.current?.click()}
                            disabled={receiptProcessing || paymentsSaving}
                            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                          >
                            {receiptProcessing ? 'Processing receipt...' : paymentForm.proofOfPaymentUrl ? 'Replace receipt image' : 'Upload GCash receipt'}
                          </button>
                          {paymentForm.proofOfPaymentUrl ? (
                            <a href={paymentForm.proofOfPaymentUrl} target="_blank" rel="noreferrer" className="text-sm text-sky-300 underline hover:text-sky-200">
                              Preview receipt
                            </a>
                          ) : null}
                        </div>
                        {receiptProcessing ? (
                          <div className="mt-2" aria-live="polite">
                            <p className="text-xs text-slate-400">{receiptMessage}</p>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                              <div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${Math.round(receiptProgress * 100)}%` }} />
                            </div>
                          </div>
                        ) : receiptMessage ? <p className="mt-2 text-xs text-slate-400" aria-live="polite">{receiptMessage}</p> : null}
                      </div>
                      <label className="text-xs text-slate-400 md:col-span-2">
                        GCash reference number
                        <input
                          value={paymentForm.referenceNumber}
                          onChange={(event) => setPaymentForm((current) => ({ ...current, referenceNumber: event.target.value }))}
                          placeholder="Read from receipt; verify or edit"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                        />
                      </label>
                    </>
                  ) : null}
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
                      <th className="px-2 py-2">Proof</th>
                      <th className="px-2 py-2">Receipt No.</th>
                      <th className="px-2 py-2">Issued By</th>
                      <th className="px-2 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-2 py-4 text-center text-slate-500">No payment records yet.</td>
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
                          <td className="px-2 py-2">{payment.proofOfPaymentUrl ? <a href={payment.proofOfPaymentUrl} target="_blank" rel="noreferrer" className="text-sky-300 underline hover:text-sky-200">View</a> : '—'}</td>
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
            </fieldset>
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
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="min-w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/70 uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Payment No.</th>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Method</th>
                      <th className="px-2 py-2">Type</th>
                      <th className="px-2 py-2">Amount</th>
                      <th className="px-2 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {receiptPayments.map((payment) => (
                      <tr key={payment._id}>
                        <td className="px-2 py-2 text-white">{payment.paymentNumber}</td>
                        <td className="px-2 py-2">{formatDate(payment.paymentDate)}</td>
                        <td className="px-2 py-2">{payment.paymentMethod}</td>
                        <td className="px-2 py-2">{payment.paymentType}</td>
                        <td className="px-2 py-2 text-emerald-300">{formatMoney(Number(payment.amountPaid || 0))}</td>
                        <td className="px-2 py-2">{payment.paymentStatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {editingReservation.pricingSummary?.addOns && editingReservation.pricingSummary.addOns.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Reservation Add-Ons</p>
                  <ul className="mt-1 space-y-1">
                    {editingReservation.pricingSummary.addOns.map((addOn) => <li key={addOn.addOnId}>{addOn.quantity}x {addOn.name}: <span className="text-emerald-300">{formatMoney(addOn.totalPrice)}</span></li>)}
                  </ul>
                </div>
              ) : null}
              <p>Total Due: <span className="text-white">{formatMoney(receiptTotalDue)}</span></p>
              <p>Total Recognized Paid: <span className="text-emerald-300">{formatMoney(receiptTotalPaid)}</span></p>
              <p>Change Due: <span className="text-amber-300">{formatMoney(receiptChangeDue)}</span></p>
              <p>Remaining Balance: <span className="text-amber-300">{formatMoney(Math.max(receiptTotalDue - receiptTotalPaid, 0))}</span></p>
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
                disabled={!gmailStatus.connected || receiptEmailSendingId === selectedReceipt._id}
                title={!gmailStatus.connected ? 'Connect Gmail to email receipts' : undefined}
                onClick={() => { void emailOfficialReceipt(selectedReceipt); }}
                className="rounded-lg border border-sky-700/50 px-4 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-900/20 disabled:opacity-50"
              >
                {receiptEmailSendingId === selectedReceipt._id ? 'Sending...' : 'Email Receipt'}
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
