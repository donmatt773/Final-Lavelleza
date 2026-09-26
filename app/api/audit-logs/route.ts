import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/db';
import AuditLog from '@/app/lib/AuditLog';
import { getSessionFromRequest } from '@/app/lib/auth';

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
  }
  if (session.role !== 0) {
    return NextResponse.json({ success: false, message: 'Owner access required.' }, { status: 403 });
  }

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const requestedLimit = Number(searchParams.get('limit') || 50);
    const requestedPage = Number(searchParams.get('page') || 1);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const page = Number.isInteger(requestedPage) ? Math.max(requestedPage, 1) : 1;
    const entityType = searchParams.get('entityType');
    const query: Record<string, unknown> = {};

    if (entityType && ['RESERVATION', 'PAYMENT', 'USER', 'ROOM', 'PROMO', 'ADD_ON', 'RATE_SETTINGS'].includes(entityType)) {
      query.entityType = entityType;
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(query),
    ]);

    return NextResponse.json({ success: true, logs, total, page, limit }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to load activity log.' }, { status: 500 });
  }
}