import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/app/lib/db';
import Reservation from '@/app/lib/Reservation';
import RateSettings, { DEFAULT_EMAIL_BODY, DEFAULT_EMAIL_SUBJECT } from '@/app/lib/RateSettings';
import { getSessionFromRequest } from '@/app/lib/auth';
import { sendGmailMessage } from '@/app/lib/gmailService';
import { writeAuditLog } from '@/app/lib/auditLogWriter';

function formatDate(value: Date | string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-PH', { dateStyle: 'long' }).format(date);
}

function roomName(value: unknown) {
  if (!value || typeof value !== 'object' || !('name' in value)) return 'Room';
  return typeof value.name === 'string' && value.name ? value.name : 'Room';
}

function roomNames(reservation: { room?: unknown; roomAssignments?: Array<{ room?: unknown }> }) {
  const assigned = reservation.roomAssignments?.map((assignment) => roomName(assignment.room)).filter(Boolean) || [];
  if (assigned.length) return Array.from(new Set(assigned)).join(', ');
  return roomName(reservation.room);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session || (session.role !== 0 && session.role !== 1)) {
    return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid reservation ID.' }, { status: 400 });
    }

    const reservation = await Reservation.findById(id)
      .populate('room', 'name')
      .populate('roomAssignments.room', 'name')
      .select('reservationNumber guestName email checkIn checkOut adults children reservationStatus room roomAssignments pricingSummary.grandTotal')
      .lean();
    if (!reservation) return NextResponse.json({ success: false, message: 'Reservation not found.' }, { status: 404 });
    if (!reservation.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservation.email)) {
      return NextResponse.json({ success: false, message: 'This reservation does not have a valid customer email address.' }, { status: 400 });
    }

    const status = String(reservation.reservationStatus || 'PENDING').replaceAll('_', ' ').toUpperCase();
    const settings = await RateSettings.findOne({ key: 'default' }).select('emailSubject emailBody').lean();
    const values: Record<string, string> = {
      guestName: reservation.guestName,
      reservationNumber: reservation.reservationNumber,
      status,
      statusMessage: status === 'PENDING'
        ? 'Your request is being reviewed. Our team will contact you once availability is confirmed.'
        : status === 'CONFIRMED'
          ? 'Your stay is confirmed. Please keep this reservation number for your records.'
          : 'Please contact La Velleza Resort if you have questions about this status update.',
      roomLabel: (reservation.roomAssignments?.length || 1) > 1 ? 'Rooms' : 'Room',
      rooms: roomNames(reservation),
      checkIn: formatDate(reservation.checkIn),
      checkOut: formatDate(reservation.checkOut),
      adults: String(Number(reservation.adults || 0)),
      children: String(Number(reservation.children || 0)),
      total: Number(reservation.pricingSummary?.grandTotal || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    };
    const renderTemplate = (template: string) => template.replace(/\{\{([a-zA-Z]+)\}\}/g, (placeholder, key: string) => values[key] ?? placeholder);
    const subject = renderTemplate(settings?.emailSubject || DEFAULT_EMAIL_SUBJECT);
    const text = renderTemplate(settings?.emailBody || DEFAULT_EMAIL_BODY);

    await sendGmailMessage({ to: reservation.email, subject, text });
    await writeAuditLog(request, {
      action: 'SEND_CUSTOMER_EMAIL',
      entityType: 'RESERVATION',
      entityId: String(reservation._id),
      entityLabel: `${reservation.reservationNumber} (${reservation.guestName})`,
      summary: `Sent a reservation ${status} email to the customer using Gmail.`,
      changedFields: [],
    });

    return NextResponse.json({ success: true, message: `Email sent to ${reservation.email}.` });
  } catch (error) {
    console.error('RESERVATION EMAIL ERROR:', error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Unable to send customer email.' }, { status: 502 });
  }
}