import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/db';
import GmailConnection from '@/app/lib/GmailConnection';
import { getSessionFromRequest } from '@/app/lib/auth';

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session || (session.role !== 0 && session.role !== 1)) {
    return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
  }

  try {
    await connectDB();
    const connection = await GmailConnection.findOne({ key: 'primary' }).select('email connectedAt connectedBy').lean();
    return NextResponse.json({
      success: true,
      connected: Boolean(connection),
      email: connection?.email || null,
      connectedAt: connection?.connectedAt || null,
      connectedBy: connection?.connectedBy || null,
      canManage: session.role === 0,
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch {
    return NextResponse.json({ success: false, message: 'Unable to check Gmail connection.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
  if (session.role !== 0) return NextResponse.json({ success: false, message: 'Owner access required.' }, { status: 403 });

  try {
    await connectDB();
    await GmailConnection.deleteOne({ key: 'primary' });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, message: 'Unable to disconnect Gmail.' }, { status: 500 });
  }
}