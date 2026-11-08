import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginSchema } from '@app/shared';
import { env, isProd } from '../env.js';
import { HttpError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { CSRF_COOKIE, issueCsrfCookie, requireCsrf } from '../middleware/csrf.js';
import {
  SESSION_COOKIE,
  SESSION_TTL_SEC,
  getMe,
  signStaffToken,
  verifyCredentials,
} from '../services/auth.service.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await verifyCredentials(email, password);
  if (!user) throw new HttpError(401, 'Email or password is incorrect', 'INVALID_CREDENTIALS');

  res.cookie(SESSION_COOKIE, signStaffToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    domain: env.COOKIE_DOMAIN,
    maxAge: SESSION_TTL_SEC * 1000,
  });
  issueCsrfCookie(res);
  res.json(user);
});

authRouter.post('/logout', requireCsrf, (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/', domain: env.COOKIE_DOMAIN });
  res.clearCookie(CSRF_COOKIE, { path: '/', domain: env.COOKIE_DOMAIN });
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const me = await getMe(req.user!.sub);
  if (!me) throw new HttpError(401, 'Not signed in', 'UNAUTHENTICATED');
  res.json(me);
});
