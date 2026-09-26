import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import GmailConnection from '@/app/lib/GmailConnection';

function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  const encryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.');
  }
  if (!encryptionKey || !/^[a-f\d]{64}$/i.test(encryptionKey)) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be a 64-character hex-encoded 32-byte key.');
  }

  return { clientId, clientSecret, redirectUri, encryptionKey: Buffer.from(encryptionKey, 'hex') };
}

export function getGoogleOAuthAuthorizationUrl(state: string) {
  const { clientId, redirectUri } = getGoogleOAuthConfig();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email https://www.googleapis.com/auth/gmail.send');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  return url;
}

export function encryptGmailRefreshToken(refreshToken: string) {
  const { encryptionKey } = getGoogleOAuthConfig();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(refreshToken, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}`;
}

function decryptGmailRefreshToken(value: string) {
  const { encryptionKey } = getGoogleOAuthConfig();
  const [ivHex, authTagHex, encryptedHex] = value.split('.');
  if (!ivHex || !authTagHex || !encryptedHex) throw new Error('Stored Gmail connection token is invalid. Reconnect Gmail.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8');
}

export async function saveGmailConnection({ email, refreshToken, connectedBy }: { email: string; refreshToken: string; connectedBy: string }) {
  await GmailConnection.findOneAndUpdate(
    { key: 'primary' },
    { $set: { email, refreshTokenEncrypted: encryptGmailRefreshToken(refreshToken), connectedBy, connectedAt: new Date() } },
    { upsert: true, new: true, runValidators: true }
  );
}

export async function sendGmailMessage({ to, subject, text }: { to: string; subject: string; text: string }) {
  if (/[\r\n]/.test(to) || /[\r\n]/.test(subject)) throw new Error('Email recipient or subject is invalid.');
  const connection = await GmailConnection.findOne({ key: 'primary' }).select('+refreshTokenEncrypted').lean();
  if (!connection) throw new Error('Connect a Gmail account before sending customer email.');

  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const refreshToken = decryptGmailRefreshToken(connection.refreshTokenEncrypted);
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });
  const tokenData = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok || typeof tokenData?.access_token !== 'string') {
    throw new Error('Gmail authorization expired or was revoked. Reconnect the Gmail account.');
  }

  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  const mimeMessage = [
    `From: ${connection.email}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n').trim(),
  ].join('\r\n');
  const raw = Buffer.from(mimeMessage, 'utf8').toString('base64url');

  const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
    cache: 'no-store',
  });
  if (!sendResponse.ok) {
    const sendError = await sendResponse.json().catch(() => null);
    throw new Error(typeof sendError?.error?.message === 'string' ? sendError.error.message : 'Gmail could not send the email.');
  }
}