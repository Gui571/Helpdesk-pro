import { createHash, randomBytes } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';

export const COOKIE_NAME = 'helpdesk_session';
export const SESSION_MS = 1000 * 60 * 60 * 24 * 7;

export const generateSessionToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.SESSION_COOKIE_SECURE === 'true',
  sameSite: 'lax' as const,
  path: '/',
});

export function verifyOrigin(origin?: string) {
  if (origin !== (process.env.WEB_ORIGIN || 'http://localhost:3000')) {
    throw new ForbiddenException('Origem da solicitação inválida.');
  }
}

export function strongPassword(password: string) {
  return password.length >= 12 && Buffer.byteLength(password, 'utf8') <= 72;
}
