import Payment from '@/app/lib/Payment';
import RateSettings, { DEFAULT_EMAIL_BODY, DEFAULT_EMAIL_SUBJECT } from '@/app/lib/RateSettings';
import Reservation from '@/app/lib/Reservation';
import { sendGmailMessage } from '@/app/lib/gmailService';

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

function getRoomNames(reservation: {
  room?: unknown;
  roomAssignments?: Array<{ room?: unknown }>;
}) {
  const getName = (room: unknown) => (
    room && typeof room === 'object' && 'name' in room && typeof room.name === 'string'
      ? room.name
      : 'Room'
  );
  const assignedRooms = reservation.roomAssignments?.map((assignment) => getName(assignment.room)) || [];
  if (assignedRooms.length > 0) return Array.from(new Set(assignedRooms)).join(', ');
  return getName(reservation.room);
}

export async function sendPaymentConfirmationEmail(reservationId: string, paymentId: string, bookingStatus: string) {
  const reservation = await Reservation.findById(reservationId)
    .populate('room', 'name')
    .populate('roomAssignments.room', 'name')
    .select('reservationNumber guestName email checkIn checkOut adults children reservationStatus room roomAssignments pricingSummary.grandTotal')
    .lean();
  const payment = await Payment.findOne({ _id: paymentId, reservation: reservationId }).lean();

  if (!reservation || !payment) throw new Error('Payment or reservation could not be loaded for the confirmation email.');
  if (!reservation.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservation.email)) {
    throw new Error('Payment was recorded, but the customer email address is invalid.');
  }

  const settings = await RateSettings.findOne({ key: 'default' }).select('emailSubject emailBody').lean();
  const paymentType = String(payment.paymentType || 'PAYMENT').replaceAll('_', ' ').toLowerCase();
  const paymentMethod = payment.paymentMethod === 'GCASH' ? 'GCash' : 'Cash on arrival';
  const verifiedNote = payment.paymentMethod === 'GCASH' ? 'verified and received' : 'recorded and received';
  const bookingMessage = bookingStatus === 'CONFIRMED'
    ? 'Your booking is confirmed.'
    : `Your booking status is ${bookingStatus.replaceAll('_', ' ').toLowerCase()}.`;
  const values: Record<string, string> = {
    guestName: reservation.guestName,
    reservationNumber: reservation.reservationNumber,
    status: bookingStatus,
    statusMessage: `Your ${paymentType} of ${formatMoney(Number(payment.amountPaid || 0))} via ${paymentMethod} has been ${verifiedNote}. ${bookingMessage} Payment number: ${payment.paymentNumber}.`,
    roomLabel: (reservation.roomAssignments?.length || 1) > 1 ? 'Rooms' : 'Room',
    rooms: getRoomNames(reservation),
    checkIn: formatDate(reservation.checkIn),
    checkOut: formatDate(reservation.checkOut),
    adults: String(Number(reservation.adults || 0)),
    children: String(Number(reservation.children || 0)),
    total: Number(reservation.pricingSummary?.grandTotal || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  };
  const renderTemplate = (template: string) => template.replace(/\{\{([a-zA-Z]+)\}\}/g, (placeholder, key: string) => values[key] ?? placeholder);

  await sendGmailMessage({
    to: reservation.email,
    subject: renderTemplate(settings?.emailSubject || DEFAULT_EMAIL_SUBJECT),
    text: renderTemplate(settings?.emailBody || DEFAULT_EMAIL_BODY),
  });

  return {
    email: reservation.email,
    reservationNumber: reservation.reservationNumber,
    paymentNumber: payment.paymentNumber,
  };
}