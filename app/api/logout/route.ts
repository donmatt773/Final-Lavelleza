import { NextResponse } from 'next/server';
import { buildClearSessionCookie } from '@/app/lib/auth';

export async function POST() {
  const response = NextResponse.json({ success: true, message: 'Session cleared.' });
  response.headers.set('Set-Cookie', buildClearSessionCookie());
  return response;
}
