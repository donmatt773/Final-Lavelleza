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
  roomCheckOuts?: Array<{ room?: unknown; checkOut?: Date | string }>;
  checkOut?: Date | string;
}) {
  const getName = (room: unknown) => (
    room && typeof room === 'object' && 'name' in room && typeof room.name === 'string'
      ? room.name
      : 'Room'
  );
  const assignments = reservation.roomAssignments?.length
    ? reservation.roomAssignments.map((assignment) => ({
        id: assignment.room && typeof assignment.room === 'object' && '_id' in assignment.room
          ? String(assignment.room._id)
          : String(assignment.room || ''),
        name: getName(assignment.room),
      }))
    : [{
        id: reservation.room && typeof reservation.room === 'object' && '_id' in reservation.room
          ? String(reservation.room._id)
          : String(reservation.room || ''),
        name: getName(reservation.room),
      }];
  const checkOuts = new Map((reservation.roomCheckOuts || []).map((item) => [String(item.room), item.checkOut]));
  const dates = assignments.map((assignment) => checkOuts.get(assignment.id) || reservation.checkOut);
  const hasDifferentCheckOuts = new Set(dates.map((date) => date ? new Date(date).toISOString().slice(0, 10) : '')).size > 1;
  const uniqueAssignments = assignments.filter((assignment, index) => assignments.findIndex((item) => item.id === assignment.id) === index);
  return {
    label: hasDifferentCheckOuts ? 'Room check-outs' : uniqueAssignments.length > 1 ? 'Rooms' : 'Room',
    names: uniqueAssignments.map((assignment) => {
      const checkOut = checkOuts.get(assignment.id) || reservation.checkOut;
      return hasDifferentCheckOuts ? `${assignment.name} (out ${formatDate(checkOut)})` : assignment.name;
    }).join(', '),
  };
}

export async function sendPaymentConfirmationEmail(reservationId: string, paymentId: string, bookingStatus: string) {
  const reservation = await Reservation.findById(reservationId)
    .populate('room', 'name')
    .populate('roomAssignments.room', 'name')
    .select('reservationNumber guestName email checkIn checkOut roomCheckOuts adults children reservationStatus room roomAssignments pricingSummary.grandTotal')
    .lean();
  const payment = await Payment.findOne({ _id: paymentId, reservation: reservationId }).lean();

  if (!reservation || !payment) throw new Error('Payment or reservation could not be loaded for the confirmation email.');
  if (!reservation.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservation.email)) {
    throw new Error('Payment was recorded, but the customer email address is invalid.');
  }

  const settings = await RateSettings.findOne({ key: 'default' }).select('emailSubject emailBody').lean();
  const rooms = getRoomNames(reservation);
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
    roomLabel: rooms.label,
    rooms: rooms.names,
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