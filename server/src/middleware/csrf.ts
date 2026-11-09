import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler, Response } from 'express';
import { env, isProd } from '../env.js';
import { HttpError } from '../errors.js';
import { getCookie } from './cookies.js';

export const CSRF_COOKIE = 'csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** Double-submit cookie: readable by our JS, echoed back in a header on writes. */
export function issueCsrfCookie(res: Response) {
  res.cookie(CSRF_COOKIE, randomBytes(32).toString('base64url'), {
    httpOnly: false,
    sameSite: 'strict',
    secure: isProd,
    path: '/',
    // Shared with the web app's subdomain so its JS can read it and echo it back.
    domain: env.COOKIE_DOMAIN,
  });
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export const requireCsrf: RequestHandler = (req, _res, next) => {
  if (SAFE.has(req.method)) return next();
  const cookie = getCookie(req, CSRF_COOKIE);
  const header = req.get(CSRF_HEADER);
  if (!cookie || !header || !safeEqual(cookie, header)) {
    throw new HttpError(403, 'Invalid CSRF token', 'CSRF');
  }
  next();
};

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
