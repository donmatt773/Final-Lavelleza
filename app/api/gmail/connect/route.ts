import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/app/lib/auth';
import { getGoogleOAuthAuthorizationUrl } from '@/app/lib/gmailService';

function stateCookie(value: string, maxAge: number) {
  const parts = [`gmail_oauth_state=${value}`, 'Path=/api/gmail/callback', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
  if (session.role !== 0) return NextResponse.json({ success: false, message: 'Owner access required.' }, { status: 403 });

  try {
    const state = randomBytes(32).toString('hex');
    const response = NextResponse.redirect(getGoogleOAuthAuthorizationUrl(state));
    response.headers.set('Set-Cookie', stateCookie(state, 600));
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    return response;
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Unable to start Gmail authorization.' }, { status: 500 });
  }
}