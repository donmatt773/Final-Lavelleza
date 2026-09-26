import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/app/lib/auth';

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized.' }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  }

  return NextResponse.json({ success: true, role: session.role, name: session.name }, {
    status: 200,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}