import type { Agreement, AuditEvent } from '@prisma/client';
import type { IntegrityCheck, IntegrityResult } from '@app/shared';
import { prisma } from '../db.js';
import { verifyChain } from './audit.service.js';
import { sha256OfObject } from './storage.service.js';

const meta = (e: AuditEvent | undefined) => (e?.metadata ?? {}) as Record<string, unknown>;

async function fileCheck(
  name: string,
  key: string | null,
  expected: string | null,
): Promise<IntegrityCheck | null> {
  if (!key) return null; // not created yet
  if (!expected) return { name, ok: false, detail: 'No hash was recorded for this file.' };
  let actual: string;
  try {
    actual = await sha256OfObject(key);
  } catch {
    return {
      name,
      ok: false,
      detail: 'The file could not be read from storage (missing or deleted).',
    };
  }
  return actual === expected
    ? { name, ok: true, detail: `SHA-256 matches: ${expected}` }
    : { name, ok: false, detail: `File has changed. Recorded ${expected}, now ${actual}.` };
}

/**
 * Re-hashes every stored file, recomputes the audit chain, and checks the hashes stored on the
 * agreement agree with the ones written into the (append-only) audit events.
 */
export async function verifyIntegrity(a: Agreement): Promise<IntegrityResult> {
  if (a.purgedAt) {
    const detail = `Files and personal data were purged on ${a.purgedAt.toISOString()}. Nothing left to verify.`;
    return {
      ok: false,
      checkedAt: new Date().toISOString(),
      checks: [{ name: 'Purged', ok: false, detail }],
    };
  }
  const events = await prisma.auditEvent.findMany({
    where: { agreementId: a.id },
    orderBy: { seq: 'asc' },
  });

  const files = await Promise.all([
    fileCheck('Original PDF', a.originalPdfKey, a.originalPdfSha256),
    fileCheck('Signed PDF', a.signedPdfKey, a.signedPdfSha256),
    fileCheck('Confirmation video', a.videoKey, a.videoSha256),
  ]);

  const chain = verifyChain(events);
  const chainCheck: IntegrityCheck = chain.ok
    ? { name: 'Audit trail', ok: true, detail: `${events.length} events, hash chain intact.` }
    : {
        name: 'Audit trail',
        ok: false,
        detail: `Hash chain broken at event #${chain.brokenAtSeq}: an event was changed, removed or reordered.`,
      };

  const last = (type: string) => events.filter((e) => e.type === type).at(-1);
  const created = last('CREATED');
  const video = last('VIDEO_RECORDED');
  const signed = last('SIGNED');
  const mismatches = [
    meta(created).originalPdfSha256 !== a.originalPdfSha256 &&
      'original PDF hash differs from the CREATED event',
    a.videoKey &&
      meta(video).videoSha256 !== a.videoSha256 &&
      'video hash differs from the VIDEO_RECORDED event',
    (a.status === 'SIGNED') !== !!signed && 'status and SIGNED event disagree',
    signed &&
      meta(signed).signedPdfSha256 !== a.signedPdfSha256 &&
      'signed PDF hash differs from the SIGNED event',
    signed &&
      meta(signed).videoSha256 !== a.videoSha256 &&
      'video hash differs from the SIGNED event',
  ].filter(Boolean) as string[];
  const recordCheck: IntegrityCheck = mismatches.length
    ? {
        name: 'Recorded hashes',
        ok: false,
        detail: `Agreement record was altered: ${mismatches.join('; ')}.`,
      }
    : {
        name: 'Recorded hashes',
        ok: true,
        detail: 'Hashes on the agreement match the audit trail.',
      };

  const checks = [...files.filter((c): c is IntegrityCheck => !!c), chainCheck, recordCheck];
  return { ok: checks.every((c) => c.ok), checkedAt: new Date().toISOString(), checks };
}
