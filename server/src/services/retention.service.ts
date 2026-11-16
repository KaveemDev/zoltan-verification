import type { RetentionItem } from '../shared/index.js';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { logAccess } from './access-log.service.js';
import { deleteObject } from './storage.service.js';

export async function listRetentionDue(): Promise<RetentionItem[]> {
  const rows = await prisma.agreement.findMany({
    where: { retentionDueAt: { not: null }, purgedAt: null },
    orderBy: { retentionDueAt: 'asc' },
    take: 500,
  });
  return rows.map((a) => ({
    id: a.id,
    customerName: a.customerName,
    customerPhone: a.customerPhone,
    packageType: a.packageType,
    destination: a.destination,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    tokenExpiresAt: a.tokenExpiresAt?.toISOString() ?? null,
    signedAt: a.signedAt?.toISOString() ?? null,
    retentionDueAt: a.retentionDueAt!.toISOString(),
  }));
}

/**
 * Erases an agreement's personal data: stored files, audit events, OTP records and customer
 * fields. The agreement row stays as a tombstone (ID, status, dates, file hashes) and the purge
 * itself is written to the access log. Safe to retry if it fails part-way.
 */
export async function purgeAgreement(
  id: string,
  confirmId: string,
  adminId: string,
  ip: string | null,
) {
  if (confirmId !== id)
    throw new HttpError(400, 'Type the agreement ID exactly to confirm.', 'CONFIRMATION_MISMATCH');
  const a = await prisma.agreement.findUnique({ where: { id } });
  if (!a) throw new HttpError(404, 'Agreement not found', 'NOT_FOUND');
  if (a.purgedAt) throw new HttpError(409, 'Already purged', 'ALREADY_PURGED');
  if (!['SIGNED', 'EXPIRED', 'CANCELLED'].includes(a.status)) {
    throw new HttpError(409, 'Cancel the agreement before purging it.', 'STILL_OPEN');
  }

  // Files first: S3 deletes are idempotent, so a failed DB step below can simply be retried.
  for (const key of [a.originalPdfKey, a.signedPdfKey, a.videoKey])
    if (key) await deleteObject(key);

  await prisma.$transaction(async (tx) => {
    // Lets this connection delete audit rows past the trigger (prisma/audit-trigger.sql), then
    // clears it straight away: the setting would otherwise outlive the transaction on a pooled connection.
    await tx.$executeRaw`SET @allow_audit_purge = 1`;
    try {
      await tx.auditEvent.deleteMany({ where: { agreementId: id } });
    } finally {
      await tx.$executeRaw`SET @allow_audit_purge = NULL`;
    }
    await tx.otpChallenge.deleteMany({ where: { agreementId: id } });
    await tx.agreement.update({
      where: { id },
      data: {
        customerName: '[deleted]',
        customerPhone: '',
        customerEmail: null,
        notes: null,
        signingTokenHash: null,
        originalPdfKey: null,
        signedPdfKey: null,
        videoKey: null,
        purgedAt: new Date(),
        purgedById: adminId,
      },
    });
  });
  await logAccess(adminId, id, 'PURGED', ip);
}
