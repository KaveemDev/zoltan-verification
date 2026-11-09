import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type {
  AgreementDetail,
  AgreementListItem,
  CreateAgreement,
  ListAgreementsQuery,
  Paginated,
  PackageType,
} from '../shared/index.js';
import { listAgreementsQuery } from '../shared/index.js';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { HttpError } from '../errors.js';
import { generateToken, sha256Hex } from '../lib/crypto.js';
import { logger } from '../logger.js';
import { signingLinkEmail } from '../messaging/emails.js';
import { getEmail } from '../messaging/index.js';
import { appendAuditEvent, type RequestContext } from './audit.service.js';
import { fillTemplate, renderPdf } from './pdf.service.js';
import { keys, putObject } from './storage.service.js';

const PACKAGE_LABEL: Record<PackageType, string> = {
  VISA: 'Visa',
  TRAVEL: 'Travel',
  BOTH: 'Visa and travel',
};

const istDate = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'long' }).format(d);

/** Placeholders createAgreement fills in. Keep in sync with the vars passed to fillTemplate below. */
export const TEMPLATE_PLACEHOLDERS = [
  'businessName',
  'customerName',
  'customerPhone',
  'customerEmail',
  'packageType',
  'destination',
  'price',
  'currency',
  'notes',
  'agreementId',
  'date',
];

const istDateTime = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d) + ' IST';

export const signingLink = (token: string) => `${env.WEB_URL}/sign/${token}`;

const listSelect = {
  id: true,
  customerName: true,
  customerPhone: true,
  packageType: true,
  destination: true,
  status: true,
  createdAt: true,
  tokenExpiresAt: true,
} satisfies Prisma.AgreementSelect;

type ListRow = Prisma.AgreementGetPayload<{ select: typeof listSelect }>;
// Explicit fields, never a spread: callers pass full rows that hold the token hash and storage keys.
const toListItem = (a: ListRow): AgreementListItem => ({
  id: a.id,
  customerName: a.customerName,
  customerPhone: a.customerPhone,
  packageType: a.packageType,
  destination: a.destination,
  status: a.status,
  createdAt: a.createdAt.toISOString(),
  tokenExpiresAt: a.tokenExpiresAt?.toISOString() ?? null,
});

/**
 * Renders and stores the unsigned PDF, creates the agreement with a hashed signing token,
 * then sends the link. A failed send leaves the agreement in DRAFT so staff can resend.
 */
export async function createAgreement(input: CreateAgreement, userId: string, ctx: RequestContext) {
  const template = await prisma.agreementTemplate.findFirst({
    where: { id: input.templateId, active: true },
  });
  if (!template) throw new HttpError(400, 'Template not found or inactive', 'TEMPLATE_NOT_FOUND');

  const id = randomUUID();
  const now = new Date();
  const html = fillTemplate(template.bodyHtml, {
    businessName: env.BUSINESS_NAME,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail ?? '',
    packageType: PACKAGE_LABEL[input.packageType],
    destination: input.destination,
    price: input.price.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    currency: input.currency,
    notes: input.notes || 'None',
    agreementId: id,
    date: istDate(now),
  });
  const pdf = await renderPdf(html, `${env.BUSINESS_NAME} · Agreement ${id}`);
  const originalPdfSha256 = sha256Hex(pdf);
  const originalPdfKey = keys.originalPdf(id);
  await putObject(originalPdfKey, pdf, 'application/pdf');

  const { token, hash } = generateToken();
  await prisma.$transaction(async (tx) => {
    await tx.agreement.create({
      data: {
        id,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail,
        packageType: input.packageType,
        destination: input.destination,
        price: input.price.toFixed(2),
        currency: input.currency,
        notes: input.notes,
        templateId: template.id,
        templateVersion: template.version,
        status: 'DRAFT',
        signingTokenHash: hash,
        tokenExpiresAt: new Date(now.getTime() + env.TOKEN_TTL_HOURS * 3_600_000),
        originalPdfKey,
        originalPdfSha256,
        createdById: userId,
        createdAt: now,
      },
    });
    await appendAuditEvent(
      id,
      'CREATED',
      ctx,
      {
        createdById: userId,
        templateId: template.id,
        templateVersion: template.version,
        originalPdfSha256,
      },
      tx,
    );
  });

  await sendSigningLink(id, token, ctx);
  return prisma.agreement.findUniqueOrThrow({ where: { id }, select: listSelect }).then(toListItem);
}

/** Emails the signing link. Returns whether the provider accepted it; failures are logged as MESSAGE_FAILED. */
async function sendSigningLink(
  agreementId: string,
  token: string,
  ctx: RequestContext,
): Promise<boolean> {
  const email = getEmail();
  const a = await prisma.agreement.findUniqueOrThrow({ where: { id: agreementId } });
  try {
    if (!a.customerEmail) throw new Error('agreement has no customer email');
    const msg = signingLinkEmail({
      name: a.customerName,
      business: env.BUSINESS_NAME,
      link: signingLink(token),
      expiresAt: istDateTime(a.tokenExpiresAt!),
      support: env.SUPPORT_EMAIL,
    });
    const { messageId } = await email.send({
      to: { email: a.customerEmail, name: a.customerName },
      ...msg,
    });
    await prisma.$transaction(async (tx) => {
      // Only DRAFT → SENT; a resend must never move a further-along agreement backwards.
      await tx.agreement.updateMany({
        where: { id: agreementId, status: 'DRAFT' },
        data: { status: 'SENT' },
      });
      await appendAuditEvent(
        agreementId,
        'MESSAGE_SENT',
        ctx,
        { channel: 'email', provider: email.name, to: a.customerEmail, messageId },
        tx,
      );
    });
    return true;
  } catch (err) {
    logger.error({ err: (err as Error).message, agreementId }, 'sending signing link failed');
    await appendAuditEvent(agreementId, 'MESSAGE_FAILED', ctx, {
      channel: 'email',
      provider: email.name,
      error: (err as Error).message.slice(0, 200),
    });
    return false;
  }
}

export async function listAgreements(
  raw: ListAgreementsQuery,
): Promise<Paginated<AgreementListItem>> {
  const { q, status, packageType, from, to, page, pageSize } = listAgreementsQuery.parse(raw);
  const where: Prisma.AgreementWhereInput = {
    ...(status && { status }),
    ...(packageType && { packageType }),
    // Dates are picked in IST, the business's timezone.
    ...((from || to) && {
      createdAt: {
        ...(from && { gte: new Date(`${from}T00:00:00+05:30`) }),
        ...(to && { lte: new Date(`${to}T23:59:59.999+05:30`) }),
      },
    }),
    ...(q && {
      OR: [
        { customerName: { contains: q, mode: 'insensitive' } },
        { customerPhone: { contains: q.replace(/[\s-]/g, '') } },
        { id: q },
      ],
    }),
  };
  const [items, total] = await prisma.$transaction([
    prisma.agreement.findMany({
      where,
      select: listSelect,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.agreement.count({ where }),
  ]);
  return { items: items.map(toListItem), total, page, pageSize };
}

// ---------- Staff: detail and actions ----------

export async function getAgreementOrThrow(id: string) {
  const a = await prisma.agreement.findUnique({ where: { id } });
  if (!a) throw new HttpError(404, 'Agreement not found', 'NOT_FOUND');
  return a;
}

export async function getAgreementDetail(id: string): Promise<AgreementDetail> {
  const a = await prisma.agreement.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      auditEvents: { orderBy: { seq: 'asc' } },
    },
  });
  if (!a) throw new HttpError(404, 'Agreement not found', 'NOT_FOUND');
  return {
    ...toListItem(a),
    customerEmail: a.customerEmail,
    price: a.price.toFixed(2),
    currency: a.currency,
    notes: a.notes,
    templateId: a.templateId,
    templateVersion: a.templateVersion,
    consentTextVersion: a.consentTextVersion,
    createdBy: a.createdBy,
    signedAt: a.signedAt?.toISOString() ?? null,
    retentionDueAt: a.retentionDueAt?.toISOString() ?? null,
    purgedAt: a.purgedAt?.toISOString() ?? null,
    originalPdfSha256: a.originalPdfSha256,
    signedPdfSha256: a.signedPdfSha256,
    hasVideo: !!a.videoKey,
    videoSha256: a.videoSha256,
    videoMimeType: a.videoMimeType,
    videoDurationSec: a.videoDurationSec,
    events: a.auditEvents.map((e) => ({
      id: e.id,
      seq: e.seq,
      type: e.type,
      ip: e.ip,
      userAgent: e.userAgent,
      deviceInfo: e.deviceInfo,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
      hash: e.hash,
    })),
  };
}

const OPEN_STATUSES = ['DRAFT', 'SENT', 'OPENED', 'VERIFIED', 'EXPIRED'] as const;

/** Where an EXPIRED agreement goes back to when its link becomes valid again. */
async function statusBeforeExpiry(agreementId: string) {
  const events = await prisma.auditEvent.findMany({
    where: { agreementId, type: { in: ['OPENED', 'OTP_VERIFIED', 'MESSAGE_SENT'] } },
    select: { type: true },
  });
  const t = new Set(events.map((e) => e.type));
  return t.has('OTP_VERIFIED')
    ? 'VERIFIED'
    : t.has('OPENED')
      ? 'OPENED'
      : t.has('MESSAGE_SENT')
        ? 'SENT'
        : 'DRAFT';
}

function assertOpen(a: { status: string; purgedAt: Date | null }) {
  if (a.purgedAt) throw new HttpError(409, 'This agreement was purged.', 'PURGED');
  if (a.status === 'SIGNED')
    throw new HttpError(409, 'This agreement is already signed.', 'ALREADY_SIGNED');
  if (a.status === 'CANCELLED')
    throw new HttpError(409, 'This agreement is cancelled.', 'CANCELLED');
}

export async function cancelAgreement(
  id: string,
  reason: string | undefined,
  userId: string,
  ctx: RequestContext,
) {
  const a = await getAgreementOrThrow(id);
  assertOpen(a);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.agreement.updateMany({
      where: { id, status: { in: [...OPEN_STATUSES] } },
      data: { status: 'CANCELLED' },
    });
    if (!count) throw new HttpError(409, 'This agreement changed. Please reload.', 'CONFLICT');
    await appendAuditEvent(id, 'CANCELLED', ctx, { byUserId: userId, reason: reason ?? null }, tx);
  });
}

export async function extendExpiry(id: string, hours: number, userId: string, ctx: RequestContext) {
  const a = await getAgreementOrThrow(id);
  assertOpen(a);
  const base = Math.max(Date.now(), a.tokenExpiresAt?.getTime() ?? 0);
  const tokenExpiresAt = new Date(base + hours * 3_600_000);
  const status = a.status === 'EXPIRED' ? await statusBeforeExpiry(id) : a.status;
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.agreement.updateMany({
      where: { id, status: a.status },
      data: { tokenExpiresAt, status },
    });
    if (!count) throw new HttpError(409, 'This agreement changed. Please reload.', 'CONFLICT');
    await appendAuditEvent(
      id,
      'EXPIRY_EXTENDED',
      ctx,
      {
        byUserId: userId,
        previousExpiry: a.tokenExpiresAt?.toISOString() ?? null,
        newExpiry: tokenExpiresAt.toISOString(),
      },
      tx,
    );
  });
}

/** Issues a fresh link (the old link and any signing session stop working) and sends it. */
export async function resendLink(id: string, userId: string, ctx: RequestContext) {
  const a = await getAgreementOrThrow(id);
  assertOpen(a);
  const { token, hash } = generateToken();
  const tokenExpiresAt = new Date(Date.now() + env.TOKEN_TTL_HOURS * 3_600_000);
  const status = a.status === 'EXPIRED' ? await statusBeforeExpiry(id) : a.status;
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.agreement.updateMany({
      where: { id, status: a.status },
      data: { signingTokenHash: hash, tokenExpiresAt, status },
    });
    if (!count) throw new HttpError(409, 'This agreement changed. Please reload.', 'CONFLICT');
    await appendAuditEvent(
      id,
      'RESENT',
      ctx,
      { byUserId: userId, tokenExpiresAt: tokenExpiresAt.toISOString() },
      tx,
    );
  });
  return { sent: await sendSigningLink(id, token, ctx) };
}
