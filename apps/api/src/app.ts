import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './env.js';
import { errorHandler } from './middleware/error.js';
import rateLimit from 'express-rate-limit';
import { adminRouter } from './routes/admin.routes.js';
import { agreementsRouter } from './routes/agreements.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { signRouter } from './routes/sign.routes.js';
import { templatesRouter } from './routes/templates.routes.js';

export function createApp() {
  const app = express();
  // Client IPs go into the audit trail and rate limits, so trust exactly the proxies we run.
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.WEB_URL, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  // Signed-in routes: a generous per-IP ceiling (public signing routes have their own, stricter limits).
  const staffLimiter = rateLimit({
    windowMs: 60_000,
    limit: 600,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  app.use(
    [
      '/api/v1/agreements',
      '/api/v1/templates',
      '/api/v1/users',
      '/api/v1/access-log',
      '/api/v1/retention',
    ],
    staffLimiter,
  );

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/agreements', agreementsRouter);
  app.use('/api/v1/templates', templatesRouter);
  app.use('/api/v1', adminRouter);
  app.use('/api/v1/sign', signRouter());

  app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  app.use(errorHandler);
  return app;
}
