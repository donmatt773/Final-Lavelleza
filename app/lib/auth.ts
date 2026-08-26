import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

export interface AuthSession {
  sub: string;
  role: number;
  employeeId: string;
  name: string;
  exp: number;
}

const AUTH_COOKIE_NAME = 'lv_session';
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;
const AUTH_SECRET = process.env.AUTH_SECRET || 'la-velleza-dev-secret-change-me';

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function createSignature(token: string) {
  return createHmac('sha256', AUTH_SECRET).update(token).digest('hex');
}

export function createSessionCookieValue(session: AuthSession) {
  const token = encodeBase64Url(JSON.stringify(session));
  const signature = createSignature(token);
  return `${token}.${signature}`;
}

export function verifySessionCookieValue(value: string | null | undefined): AuthSession | null {
  if (!value) return null;

  const [token, signature] = value.split('.');
  if (!token || !signature) return null;

  const expectedSignature = createSignature(token);
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  const providedBuffer = Buffer.from(signature, 'hex');

  if (expectedBuffer.length !== providedBuffer.length) return null;

  try {
    if (!timingSafeEqual(expectedBuffer, providedBuffer)) return null;
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(token)) as Partial<AuthSession>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.sub !== 'string' || typeof parsed.role !== 'number' || typeof parsed.employeeId !== 'string' || typeof parsed.name !== 'string' || typeof parsed.exp !== 'number') {
      return null;
    }
    if (Date.now() > parsed.exp) return null;

    return {
      sub: parsed.sub,
      role: parsed.role,
      employeeId: parsed.employeeId,
      name: parsed.name,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export function getSessionFromRequest(request: Request): AuthSession | null {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookie = cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${AUTH_COOKIE_NAME}=`));

  if (!cookie) return null;
  return verifySessionCookieValue(cookie.slice(AUTH_COOKIE_NAME.length + 1));
}

export function buildSessionCookie(session: AuthSession) {
  const value = createSessionCookieValue(session);
  const parts = [`${AUTH_COOKIE_NAME}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${AUTH_COOKIE_MAX_AGE_SECONDS}`];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export function buildClearSessionCookie() {
  const parts = [`${AUTH_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

function normalizeRoleValue(value: string | null | undefined) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'undefined') return null;

  if (trimmed.toLowerCase() === 'owner' || trimmed.toLowerCase() === 'admin') return 0;

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}

export function requireOwner(request: Request) {
  const session = getSessionFromRequest(request);
  if (session) {
    if (session.role === 0) {
      return null;
    }
    return NextResponse.json({ success: false, message: 'Forbidden: owner access required.' }, { status: 403 });
  }

  const roleValue = normalizeRoleValue(request.headers.get('x-user-role'));
  if (roleValue === 0) {
    return null;
  }

  if (roleValue !== null) {
    return NextResponse.json({ success: false, message: 'Forbidden: owner access required.' }, { status: 403 });
  }

  return NextResponse.json({ success: false, message: 'Unauthorized request.' }, { status: 401 });
}

export function requireOwnerOrStaff(request: Request) {
  const session = getSessionFromRequest(request);
  if (session) {
    if (session.role === 0 || session.role === 1) {
      return null;
    }
    return NextResponse.json({ success: false, message: 'Forbidden: owner or staff access required.' }, { status: 403 });
  }

  const roleValue = normalizeRoleValue(request.headers.get('x-user-role'));
  if (roleValue === 0 || roleValue === 1) {
    return null;
  }

  if (roleValue !== null) {
    return NextResponse.json({ success: false, message: 'Forbidden: owner or staff access required.' }, { status: 403 });
  }

  return NextResponse.json({ success: false, message: 'Unauthorized request.' }, { status: 401 });
}
