import type { Agreement } from '@prisma/client';
import { Router, type Request, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import {
  completeSigningSchema,
  otpVerifySchema,
  signEventSchema,
  videoConfirmSchema,
  videoPresignSchema,
} from '@app/shared';
import { sha256Hex } from '../lib/crypto.js';
import { requestContext } from '../lib/request.js';
import {
  checkSession,
  completeSigning,
  getDocument,
  openAgreement,
  recordEvent,
  resolveToken,
  sendOtp,
  verifyOtp,
} from '../services/signing.service.js';
import { confirmVideo, presignVideo } from '../services/video.service.js';

declare module 'express-serve-static-core' {
  interface Request {
    agreement?: Agreement;
  }
}

const limitHandler: RequestHandler = (_req, res) => {
  res.status(429).json({
    error: 'RATE_LIMITED',
    message: 'Too many requests. Please wait a few minutes and try again.',
  });
};
const tokenKey = (req: Request) => sha256Hex(String(req.params.token));
const limiter = (limit: number, minutes: number, byToken = false) =>
  rateLimit({
    windowMs: minutes * 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: limitHandler,
    ...(byToken && { keyGenerator: tokenKey }),
  });

const withAgreement: RequestHandler = async (req, _res, next) => {
  req.agreement = await resolveToken(String(req.params.token), requestContext(req));
  next();
};
const withSession: RequestHandler = (req, _res, next) => {
  checkSession(req.agreement!, req.get('authorization')?.replace(/^Bearer /, ''));
  next();
};

/** Public signing API. Built per app so each app (and each test) gets fresh rate-limit counters. */
export function signRouter() {
  const r = Router();
  r.use(limiter(120, 1)); // per IP, all public endpoints
  const perTokenAll = limiter(300, 60, true);

  r.get('/:token', perTokenAll, async (req, res) => {
    res.json(await openAgreement(String(req.params.token), requestContext(req)));
  });

  r.post(
    '/:token/otp/send',
    limiter(10, 60),
    limiter(5, 60, true),
    withAgreement,
    async (req, res) => {
      res.json(await sendOtp(req.agreement!, requestContext(req)));
    },
  );

  r.post(
    '/:token/otp/verify',
    limiter(30, 15),
    limiter(15, 15, true),
    withAgreement,
    async (req, res) => {
      const { code } = otpVerifySchema.parse(req.body);
      res.json(await verifyOtp(req.agreement!, code, requestContext(req)));
    },
  );

  r.get('/:token/document', perTokenAll, withAgreement, withSession, async (req, res) => {
    res.json(await getDocument(req.agreement!));
  });

  r.post('/:token/events', perTokenAll, withAgreement, withSession, async (req, res) => {
    await recordEvent(req.agreement!, signEventSchema.parse(req.body), requestContext(req));
    res.status(204).end();
  });

  r.post(
    '/:token/video/presign',
    limiter(20, 15, true),
    withAgreement,
    withSession,
    async (req, res) => {
      res.json(await presignVideo(req.agreement!, videoPresignSchema.parse(req.body)));
    },
  );

  r.post(
    '/:token/video/confirm',
    limiter(20, 15, true),
    withAgreement,
    withSession,
    async (req, res) => {
      const { uploadId } = videoConfirmSchema.parse(req.body);
      await confirmVideo(req.agreement!, uploadId, requestContext(req));
      res.status(204).end();
    },
  );

  r.post(
    '/:token/complete',
    limiter(10, 15, true),
    withAgreement,
    withSession,
    async (req, res) => {
      const input = completeSigningSchema.parse(req.body);
      res.json(await completeSigning(req.agreement!, input, requestContext(req)));
    },
  );

  return r;
}
