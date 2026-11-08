import { createHmac, randomInt, randomUUID } from 'node:crypto';
import type { Agreement } from '@prisma/client';
import jwt from 'jsonwebtoken';
import {
  LEGAL_TEXT,
  LEGAL_TEXT_VERSION,
  type CompleteSigning,
  type CompleteSigningResult,
  type OtpSendResult,
  type OtpVerifyResult,
  type PublicAgreementInfo,
  type SignErrorCode,
  type SignEvent,
  type SigningDocument,
} from '@app/shared';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { HttpError } from '../errors.js';
import { sha256Hex } from '../lib/crypto.js';
import { logger } from '../logger.js';
import { otpEmail } from '../messaging/emails.js';
import { getEmail, getSms } from '../messaging/index.js';
import { safeEqual } from '../middleware/csrf.js';
import { appendAuditEvent, type RequestContext } from './audit.service.js';
import { assertPng, buildSignedPdf } from './signed-pdf.service.js';
import { getObjectBytes, keys, presignGet, putObject } from './storage.service.js';

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60_000;
export const SESSION_TTL_SEC = 30 * 60;

export const signError = (
  status: number,
  code: SignErrorCode,
  message: string,
  extra?: Record<string, unknown>,
) => new HttpError(status, message, code, extra);

/** Pure: which state blocks this link, if any. */
export function linkBlocker(
  a: Pick<Agreement, 'status' | 'tokenExpiresAt'>,
  now = new Date(),
): { status: number; code: SignErrorCode; message: string } | null {
  if (a.status === 'SIGNED')
    return {
      status: 409,
      code: 'ALREADY_SIGNED',
      message: 'This agreement has already been signed.',
    };
  if (a.status === 'CANCELLED')
    return { status: 410, code: 'LINK_CANCELLED', message: 'This agreement was cancelled.' };
  if (a.status === 'EXPIRED' || !a.tokenExpiresAt || a.tokenExpiresAt <= now)
    return { status: 410, code: 'LINK_EXPIRED', message: 'This link has expired.' };
  return null;
}

/** Looks up an agreement by raw token and rejects expired, cancelled or signed links. */
export async function resolveToken(token: string, ctx: RequestContext): Promise<Agreement> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw signError(404, 'LINK_INVALID', 'This link is not valid.');
  const tokenHash = sha256Hex(token);
  const a = await prisma.agreement.findUnique({ where: { signingTokenHash: tokenHash } });
  if (!a) throw signError(404, 'LINK_INVALID', 'This link is not valid.');

  const blocker = linkBlocker(a);
  if (blocker) {
    if (blocker.code === 'LINK_EXPIRED' && a.status !== 'EXPIRED') {
      // Mark once; the scheduled expiry job (phase 6) does the same for links nobody opens.
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.agreement.updateMany({
          where: { id: a.id, status: { in: ['DRAFT', 'SENT', 'OPENED', 'VERIFIED'] } },
          data: { status: 'EXPIRED' },
        });
        if (count)
          await appendAuditEvent(a.id, 'EXPIRED', ctx, { reason: 'link opened after expiry' }, tx);
      });
    }
    throw signError(blocker.status, blocker.code, blocker.message);
  }
  return a;
}

export async function openAgreement(
  token: string,
  ctx: RequestContext,
): Promise<PublicAgreementInfo> {
  const a = await resolveToken(token, ctx);
  await prisma.$transaction(async (tx) => {
    const opened = await tx.auditEvent.findFirst({
      where: { agreementId: a.id, type: 'OPENED' },
      select: { id: true },
    });
    if (opened) return;
    await tx.agreement.updateMany({
      where: { id: a.id, status: 'SENT' },
      data: { status: 'OPENED' },
    });
    await appendAuditEvent(a.id, 'OPENED', ctx, {}, tx);
  });
  const target = codeTarget(a);
  return {
    businessName: env.BUSINESS_NAME,
    customerName: a.customerName,
    codeChannel: target.channel,
    codeDestination: target.masked,
    packageType: a.packageType,
    destination: a.destination,
    expiresAt: a.tokenExpiresAt!.toISOString(),
  };
}

// ---------- OTP ----------

/**
 * SMS for numbers in SMS_COUNTRY_CODES (DLT-registered, cheap), email for everyone else
 * (international SMS costs several times more). Falls back to SMS if there is no email.
 */
export function codeTarget(a: Pick<Agreement, 'customerPhone' | 'customerEmail'>) {
  const sms = env.SMS_COUNTRY_CODES.some((c) => a.customerPhone.startsWith(c)) || !a.customerEmail;
  if (sms)
    return {
      channel: 'sms' as const,
      to: a.customerPhone,
      masked: `••••${a.customerPhone.slice(-4)}`,
    };
  const [user = '', domain = ''] = a.customerEmail!.split('@');
  return {
    channel: 'email' as const,
    to: a.customerEmail!,
    masked: `${user.slice(0, 1)}•••@${domain}`,
  };
}

/** Keyed hash: a leaked DB row can't be brute-forced offline over the 10^6 code space. */
export const otpHash = (challengeId: string, code: string) =>
  createHmac('sha256', env.SIGNING_SESSION_SECRET).update(`${challengeId}:${code}`).digest('hex');

export async function sendOtp(a: Agreement, ctx: RequestContext): Promise<OtpSendResult> {
  const last = await prisma.otpChallenge.findFirst({
    where: { agreementId: a.id },
    orderBy: { createdAt: 'desc' },
  });
  const now = Date.now();
  if (last && now - last.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    const resendAvailableAt = new Date(
      last.createdAt.getTime() + OTP_RESEND_COOLDOWN_MS,
    ).toISOString();
    throw signError(429, 'OTP_COOLDOWN', 'Please wait a moment before asking for a new code.', {
      resendAvailableAt,
    });
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const id = randomUUID();
  const challenge = await prisma.otpChallenge.create({
    data: {
      id,
      agreementId: a.id,
      codeHash: otpHash(id, code),
      expiresAt: new Date(now + OTP_TTL_MS),
    },
  });
  // Older codes stop working once a new one is issued.
  await prisma.otpChallenge.updateMany({
    where: { agreementId: a.id, id: { not: challenge.id }, consumedAt: null },
    data: { consumedAt: new Date(now) },
  });

  const target = codeTarget(a);
  const provider = target.channel === 'sms' ? getSms() : getEmail();
  const { messageId } =
    target.channel === 'sms'
      ? await getSms().sendOtp(target.to, code)
      : await getEmail().send({
          to: { email: target.to, name: a.customerName },
          ...otpEmail({ business: env.BUSINESS_NAME, code, support: env.SUPPORT_EMAIL }),
        });
  await appendAuditEvent(a.id, 'OTP_SENT', ctx, {
    challengeId: challenge.id,
    channel: target.channel,
    to: target.to,
    provider: provider.name,
    messageId,
  });
  return {
    expiresAt: challenge.expiresAt.toISOString(),
    resendAvailableAt: new Date(now + OTP_RESEND_COOLDOWN_MS).toISOString(),
  };
}

export async function verifyOtp(
  a: Agreement,
  code: string,
  ctx: RequestContext,
): Promise<OtpVerifyResult> {
  const challenge = await prisma.otpChallenge.findFirst({
    where: { agreementId: a.id, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge || challenge.expiresAt <= new Date()) {
    throw signError(400, 'OTP_EXPIRED', 'This code has expired. Please ask for a new one.');
  }
  // Count the attempt before comparing, atomically, so parallel guesses can't exceed the limit.
  const { count } = await prisma.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (!count) throw signError(429, 'OTP_LOCKED', 'Too many wrong codes. Please ask for a new one.');

  if (!safeEqual(otpHash(challenge.id, code), challenge.codeHash)) {
    const attemptsLeft = OTP_MAX_ATTEMPTS - (challenge.attempts + 1);
    await appendAuditEvent(a.id, 'OTP_FAILED', ctx, { challengeId: challenge.id, attemptsLeft });
    throw signError(400, 'OTP_INVALID', 'That code is not right.', { attemptsLeft });
  }

  await prisma.$transaction(async (tx) => {
    await tx.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
    await tx.agreement.updateMany({
      where: { id: a.id, status: { in: ['DRAFT', 'SENT', 'OPENED'] } },
      data: { status: 'VERIFIED' },
    });
    const { channel, to } = codeTarget(a);
    await appendAuditEvent(
      a.id,
      'OTP_VERIFIED',
      ctx,
      { challengeId: challenge.id, channel, to },
      tx,
    );
  });
  return issueSession(a);
}

// ---------- Signing session (short-lived JWT bound to this link's token) ----------

interface SessionClaims {
  sub: string;
  th: string; // token hash: resending a new link invalidates old sessions
  typ: 'sign';
}

function issueSession(a: Agreement): OtpVerifyResult {
  const claims: SessionClaims = { sub: a.id, th: a.signingTokenHash!, typ: 'sign' };
  const sessionToken = jwt.sign(claims, env.SIGNING_SESSION_SECRET, {
    algorithm: 'HS256',
    expiresIn: SESSION_TTL_SEC,
  });
  return { sessionToken, expiresAt: new Date(Date.now() + SESSION_TTL_SEC * 1000).toISOString() };
}

export function checkSession(a: Agreement, sessionToken: string | undefined) {
  try {
    if (!sessionToken) throw new Error('missing');
    const c = jwt.verify(sessionToken, env.SIGNING_SESSION_SECRET, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    if (
      c.typ !== 'sign' ||
      c.sub !== a.id ||
      typeof c.th !== 'string' ||
      !safeEqual(c.th, a.signingTokenHash!)
    ) {
      throw new Error('mismatch');
    }
  } catch {
    throw signError(401, 'SESSION_EXPIRED', 'For your security, please confirm with a new code.');
  }
}

// ---------- Steps ----------

export async function stepsDone(a: Pick<Agreement, 'id' | 'videoKey'>) {
  const events = await prisma.auditEvent.findMany({
    where: { agreementId: a.id, type: { in: ['AGREEMENT_VIEWED', 'RECORDING_CONSENT_GIVEN'] } },
    select: { type: true },
  });
  const types = new Set(events.map((e) => e.type));
  return {
    viewed: types.has('AGREEMENT_VIEWED'),
    recordingConsented: types.has('RECORDING_CONSENT_GIVEN'),
    videoRecorded: !!a.videoKey,
  };
}

export async function getDocument(a: Agreement): Promise<SigningDocument> {
  return {
    pdfUrl: await presignGet(a.originalPdfKey!, 5 * 60, 'application/pdf'),
    packageType: a.packageType,
    destination: a.destination,
    price: a.price.toFixed(2),
    currency: a.currency,
    progress: await stepsDone(a),
  };
}

export async function recordEvent(a: Agreement, event: SignEvent, ctx: RequestContext) {
  if (event.type === 'AGREEMENT_VIEWED') {
    if (event.pagesViewed < event.totalPages) {
      throw signError(400, 'STEP_MISSING', 'Please scroll through the whole agreement.');
    }
    const { type, ...metadata } = event;
    await appendAuditEvent(a.id, type, ctx, metadata);
    return;
  }
  assertLegalVersion(event.legalTextVersion);
  await prisma.$transaction(async (tx) => {
    await tx.agreement.update({
      where: { id: a.id },
      data: { consentTextVersion: LEGAL_TEXT_VERSION },
    });
    await appendAuditEvent(
      a.id,
      'RECORDING_CONSENT_GIVEN',
      ctx,
      { legalTextVersion: LEGAL_TEXT_VERSION },
      tx,
    );
  });
}

export function assertLegalVersion(v: string) {
  if (v !== LEGAL_TEXT_VERSION) {
    throw signError(409, 'LEGAL_TEXT_CHANGED', 'The wording was updated. Please reload the page.');
  }
}

export async function assertReadyToSign(a: Agreement) {
  const done = await stepsDone(a);
  if (!done.viewed || !done.recordingConsented || !done.videoRecorded) {
    throw signError(400, 'STEP_MISSING', 'Please complete the earlier steps first.', done);
  }
}

// ---------- Completion ----------

export async function completeSigning(
  a: Agreement,
  input: CompleteSigning,
  ctx: RequestContext,
): Promise<CompleteSigningResult> {
  assertLegalVersion(input.legalTextVersion);
  await assertReadyToSign(a);

  const signaturePng = Buffer.from(input.signaturePng.split(',')[1]!, 'base64');
  try {
    assertPng(signaturePng);
  } catch {
    throw new HttpError(400, 'Please draw your signature again.', 'VALIDATION');
  }

  const original = await getObjectBytes(a.originalPdfKey!);
  if (sha256Hex(original) !== a.originalPdfSha256) {
    logger.error({ agreementId: a.id }, 'original PDF hash mismatch at signing');
    throw new HttpError(
      500,
      'We could not verify the agreement file. Please contact us.',
      'INTEGRITY',
    );
  }

  const [lastEvent, otpEvent] = await Promise.all([
    prisma.auditEvent.findFirst({
      where: { agreementId: a.id },
      orderBy: { seq: 'desc' },
      select: { hash: true },
    }),
    prisma.auditEvent.findFirst({
      where: { agreementId: a.id, type: 'OTP_VERIFIED' },
      orderBy: { seq: 'desc' },
      select: { createdAt: true, metadata: true },
    }),
  ]);
  if (!otpEvent)
    throw signError(400, 'STEP_MISSING', 'Please verify with the one-time code first.');

  const signedAt = new Date();
  const signed = await buildSignedPdf(original, signaturePng, {
    agreementId: a.id,
    businessName: env.BUSINESS_NAME,
    customerName: a.customerName,
    typedName: input.typedName,
    verifiedBy: describeVerification(otpEvent.metadata, a.customerPhone),
    otpVerifiedAt: otpEvent.createdAt,
    signedAt,
    ip: ctx.ip ?? 'unknown',
    userAgent: ctx.userAgent ?? 'unknown',
    deviceInfo: ctx.deviceInfo ? JSON.stringify(ctx.deviceInfo) : 'not provided',
    originalPdfSha256: a.originalPdfSha256!,
    video: { sha256: a.videoSha256!, durationSec: a.videoDurationSec!, mimeType: a.videoMimeType! },
    auditChainHead: lastEvent!.hash,
    legalTextVersion: LEGAL_TEXT_VERSION,
    agreementConsentText: LEGAL_TEXT.agreementConsent,
  });
  const signedPdfSha256 = sha256Hex(signed);
  const signedPdfKey = keys.signedPdf(a.id, randomUUID());
  await putObject(signedPdfKey, signed, 'application/pdf');

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.agreement.updateMany({
      where: { id: a.id, signedAt: null, status: { in: ['DRAFT', 'SENT', 'OPENED', 'VERIFIED'] } },
      data: { status: 'SIGNED', signedAt, signedPdfKey, signedPdfSha256 },
    });
    if (!count) throw signError(409, 'ALREADY_SIGNED', 'This agreement has already been signed.');
    await appendAuditEvent(
      a.id,
      'SIGNED',
      ctx,
      {
        typedName: input.typedName,
        signatureSha256: sha256Hex(signaturePng),
        signedPdfSha256,
        originalPdfSha256: a.originalPdfSha256,
        videoSha256: a.videoSha256,
        legalTextVersion: LEGAL_TEXT_VERSION,
      },
      tx,
    );
  });
  return { agreementId: a.id, signedAt: signedAt.toISOString() };
}

/** e.g. "SMS code to +919876543210". Older events (before channels were recorded) were SMS to the phone. */
function describeVerification(metadata: unknown, phone: string) {
  const m = (metadata ?? {}) as { channel?: string; to?: string };
  return m.channel === 'email' ? `Email code to ${m.to}` : `SMS code to ${m.to ?? phone}`;
}
