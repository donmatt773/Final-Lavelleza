import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/db';
import { getSessionFromRequest } from '@/app/lib/auth';
import { saveGmailConnection } from '@/app/lib/gmailService';

function readCookie(request: Request, name: string) {
  return (request.headers.get('cookie') || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || '';
}

function constantTimeEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}

function clearStateCookie() {
  const parts = ['gmail_oauth_state=', 'Path=/api/gmail/callback', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

function dashboardRedirect(request: Request, result: string) {
  const redirect = NextResponse.redirect(new URL(`/dashboard/owner?gmail=${encodeURIComponent(result)}`, request.url));
  redirect.headers.set('Set-Cookie', clearStateCookie());
  redirect.headers.set('Cache-Control', 'no-store, max-age=0');
  return redirect;
}

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session || session.role !== 0) return NextResponse.redirect(new URL('/login', request.url));

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code') || '';
  const state = searchParams.get('state') || '';
  const savedState = readCookie(request, 'gmail_oauth_state');
  if (!code || !state || !savedState || !constantTimeEqual(state, savedState)) {
    return dashboardRedirect(request, 'error');
  }
  if (searchParams.has('error')) return dashboardRedirect(request, 'error');

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
    if (!clientId || !clientSecret || !redirectUri) throw new Error('Google OAuth environment values are missing.');

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      cache: 'no-store',
    });
    const tokenData = await tokenResponse.json().catch(() => null);
    if (!tokenResponse.ok || typeof tokenData?.refresh_token !== 'string') {
      throw new Error('Google did not return a refresh token. Reconnect and grant Gmail access.');
    }

    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      cache: 'no-store',
    });
    const profile = await profileResponse.json().catch(() => null);
    if (!profileResponse.ok || typeof profile?.email !== 'string') throw new Error('Unable to identify the connected Google account.');

    await connectDB();
    await saveGmailConnection({
      email: profile.email,
      refreshToken: tokenData.refresh_token,
      connectedBy: `${session.name} (${session.employeeId})`,
    });
    return dashboardRedirect(request, 'connected');
  } catch (error) {
    console.error('GMAIL OAUTH CALLBACK ERROR:', error);
    return dashboardRedirect(request, 'error');
  }
}