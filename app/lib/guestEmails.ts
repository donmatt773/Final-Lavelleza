import RateSettings, {
  DEFAULT_PRE_ARRIVAL_EMAIL_BODY,
  DEFAULT_PRE_ARRIVAL_EMAIL_SUBJECT,
  DEFAULT_THANK_YOU_EMAIL_BODY,
  DEFAULT_THANK_YOU_EMAIL_SUBJECT,
} from '@/app/lib/RateSettings';
import { sendGmailMessage } from '@/app/lib/gmailService';

type EmailRoomSummary = {
  room?: unknown;
  roomAssignments?: Array<{ room?: unknown }>;
};

export function formatEmailDate(value: Date | string | undefined | null) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-PH', { dateStyle: 'long' }).format(date);
}

export function formatEmailMoney(value: number) {
  return value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function roomName(value: unknown) {
  if (!value || typeof value !== 'object' || !('name' in value)) return 'Room';
  return typeof value.name === 'string' && value.name ? value.name : 'Room';
}

export function getRoomSummary(reservation: EmailRoomSummary) {
  const assignments = reservation.roomAssignments?.length
    ? reservation.roomAssignments
    : [{ room: reservation.room }];
  const names = assignments.map((assignment) => roomName(assignment.room));
  const uniqueNames = names.filter((name, index) => names.indexOf(name) === index);
  return {
    label: uniqueNames.length > 1 ? 'Rooms' : 'Room',
    names: uniqueNames.join(', '),
  };
}

export function renderEmailTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{([a-zA-Z]+)\}\}/g, (placeholder, key: string) => values[key] ?? placeholder);
}

type GuestEmailReservation = {
  guestName?: string;
  reservationNumber?: string;
  email?: string;
  checkIn?: Date | string;
  checkOut?: Date | string;
  adults?: number;
  children?: number;
  specialRequests?: string;
  pricingSummary?: { grandTotal?: number };
} & EmailRoomSummary;

type GuestEmailSettings = {
  checkInTime?: string;
  checkOutTime?: string;
  resortAddress?: string;
  contactPhone?: string;
  reviewUrl?: string;
  cancellationPolicy?: string;
  preArrivalEmailSubject?: string;
  preArrivalEmailBody?: string;
  thankYouEmailSubject?: string;
  thankYouEmailBody?: string;
};

function buildCommonValues(reservation: GuestEmailReservation, settings: GuestEmailSettings | null): Record<string, string> {
  const rooms = getRoomSummary(reservation);
  const specialRequests = typeof reservation.specialRequests === 'string' && reservation.specialRequests.trim()
    ? `Special requests: ${reservation.specialRequests.trim()}`
    : '';
  return {
    guestName: reservation.guestName || 'Guest',
    reservationNumber: reservation.reservationNumber || '',
    roomLabel: rooms.label,
    rooms: rooms.names,
    checkIn: formatEmailDate(reservation.checkIn),
    checkOut: formatEmailDate(reservation.checkOut),
    checkInTime: settings?.checkInTime || '1:00 PM',
    checkOutTime: settings?.checkOutTime || '11:00 AM',
    adults: String(Number(reservation.adults || 0)),
    children: String(Number(reservation.children || 0)),
    total: formatEmailMoney(Number(reservation.pricingSummary?.grandTotal || 0)),
    specialRequests,
    resortAddress: settings?.resortAddress || 'La Velleza Resort',
    contactPhone: settings?.contactPhone || '',
    reviewUrl: settings?.reviewUrl || '',
    cancellationPolicy: settings?.cancellationPolicy || '',
  };
}

function requireValidEmail(reservation: GuestEmailReservation) {
  if (!reservation.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservation.email)) {
    throw new Error('This reservation does not have a valid customer email address.');
  }
  return reservation.email;
}

export async function sendPreArrivalEmail(reservation: GuestEmailReservation) {
  const to = requireValidEmail(reservation);
  const settings = await RateSettings.findOne({ key: 'default' })
    .select('checkInTime checkOutTime resortAddress contactPhone reviewUrl cancellationPolicy preArrivalEmailSubject preArrivalEmailBody')
    .lean();
  const values = buildCommonValues(reservation, settings);

  await sendGmailMessage({
    to,
    subject: renderEmailTemplate(settings?.preArrivalEmailSubject || DEFAULT_PRE_ARRIVAL_EMAIL_SUBJECT, values),
    text: renderEmailTemplate(settings?.preArrivalEmailBody || DEFAULT_PRE_ARRIVAL_EMAIL_BODY, values),
  });

  return { email: to, reservationNumber: reservation.reservationNumber || '' };
}

export async function sendThankYouEmail(reservation: GuestEmailReservation) {
  const to = requireValidEmail(reservation);
  const settings = await RateSettings.findOne({ key: 'default' })
    .select('checkInTime checkOutTime resortAddress contactPhone reviewUrl cancellationPolicy thankYouEmailSubject thankYouEmailBody')
    .lean();
  const values = buildCommonValues(reservation, settings);

  await sendGmailMessage({
    to,
    subject: renderEmailTemplate(settings?.thankYouEmailSubject || DEFAULT_THANK_YOU_EMAIL_SUBJECT, values),
    text: renderEmailTemplate(settings?.thankYouEmailBody || DEFAULT_THANK_YOU_EMAIL_BODY, values),
  });

  return { email: to, reservationNumber: reservation.reservationNumber || '' };
}
