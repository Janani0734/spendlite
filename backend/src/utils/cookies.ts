import type { CookieOptions, Response } from 'express';
import { env } from '../config/env';

export const AUTH_COOKIE_NAME = 'spendlite_token';

const baseOptions: CookieOptions = {
  httpOnly: true, // not readable from JavaScript, which limits XSS token theft
  secure: env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: 'lax',
  path: '/',
};

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    ...baseOptions,
    maxAge: env.JWT_EXPIRES_IN_SECONDS * 1000,
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, baseOptions);
}