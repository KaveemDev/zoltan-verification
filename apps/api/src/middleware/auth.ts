import type { RequestHandler } from 'express';
import type { Role } from '@app/shared';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { SESSION_COOKIE, verifyStaffToken, type StaffClaims } from '../services/auth.service.js';
import { getCookie } from './cookies.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: StaffClaims;
  }
}

/**
 * Valid session cookie AND a still-active user. The role comes from the database, so
 * deactivating someone or changing their role takes effect on their next request.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = getCookie(req, SESSION_COOKIE);
  const claims = token ? verifyStaffToken(token) : null;
  const user =
    claims &&
    (await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { active: true, role: true },
    }));
  if (!claims || !user?.active) throw new HttpError(401, 'Not signed in', 'UNAUTHENTICATED');
  req.user = { sub: claims.sub, role: user.role };
  next();
};

export const requireRole =
  (role: Role): RequestHandler =>
  (req, _res, next) => {
    if (req.user?.role !== role) throw new HttpError(403, 'Not allowed', 'FORBIDDEN');
    next();
  };
