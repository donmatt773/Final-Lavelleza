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

function roomSummary(reservation: {
  room?: unknown;
  roomAssignments?: Array<{ room?: unknown }>;
  roomCheckOuts?: Array<{ room?: unknown; checkOut?: Date | string }>;
  checkOut?: Date | string;
}) {
  const assignments = reservation.roomAssignments?.length
    ? reservation.roomAssignments.map((assignment) => ({
        id: assignment.room && typeof assignment.room === 'object' && '_id' in assignment.room
          ? String(assignment.room._id)
          : String(assignment.room || ''),
        name: roomName(assignment.room),
      }))
    : [{
        id: reservation.room && typeof reservation.room === 'object' && '_id' in reservation.room
          ? String(reservation.room._id)
          : String(reservation.room || ''),
        name: roomName(reservation.room),
      }];
  const checkOuts = new Map((reservation.roomCheckOuts || []).map((item) => [String(item.room), item.checkOut]));
  const dates = assignments.map((assignment) => checkOuts.get(assignment.id) || reservation.checkOut);
  const hasDifferentCheckOuts = new Set(dates.map((date) => date ? new Date(date).toISOString().slice(0, 10) : '')).size > 1;
  const uniqueAssignments = assignments.filter((assignment, index) => assignments.findIndex((item) => item.id === assignment.id) === index);
  return {
    label: hasDifferentCheckOuts ? 'Room check-outs' : uniqueAssignments.length > 1 ? 'Rooms' : 'Room',
    names: uniqueAssignments.map((assignment) => {
      const checkOut = checkOuts.get(assignment.id) || reservation.checkOut;
      return hasDifferentCheckOuts ? `${assignment.name} (out ${formatDate(checkOut || '')})` : assignment.name;
    }).join(', '),
  };
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
      .select('reservationNumber guestName email checkIn checkOut roomCheckOuts adults children reservationStatus room roomAssignments pricingSummary.grandTotal')
      .lean();
    if (!reservation) return NextResponse.json({ success: false, message: 'Reservation not found.' }, { status: 404 });
    if (!reservation.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservation.email)) {
      return NextResponse.json({ success: false, message: 'This reservation does not have a valid customer email address.' }, { status: 400 });
    }

    const status = String(reservation.reservationStatus || 'PENDING').replaceAll('_', ' ').toUpperCase();
    const settings = await RateSettings.findOne({ key: 'default' }).select('emailSubject emailBody').lean();
    const rooms = roomSummary(reservation);
    const values: Record<string, string> = {
      guestName: reservation.guestName,
      reservationNumber: reservation.reservationNumber,
      status,
      statusMessage: status === 'PENDING'
        ? 'Your request is being reviewed. Our team will contact you once availability is confirmed.'
        : status === 'CONFIRMED'
          ? 'Your stay is confirmed. Please keep this reservation number for your records.'
          : 'Please contact La Velleza Resort if you have questions about this status update.',
      roomLabel: rooms.label,
      rooms: rooms.names,
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