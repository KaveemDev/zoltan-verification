import { Prisma, type AuditEvent } from '@prisma/client';
import type { AuditEventType } from '@app/shared';
import { prisma } from '../db.js';
import { canonicalJson, sha256Hex } from '../lib/crypto.js';

export const GENESIS_HASH = '0'.repeat(64);

export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
  deviceInfo?: Record<string, unknown> | null;
}

type HashedFields = Pick<
  AuditEvent,
  | 'agreementId'
  | 'seq'
  | 'type'
  | 'ip'
  | 'userAgent'
  | 'deviceInfo'
  | 'metadata'
  | 'createdAt'
  | 'prevHash'
>;

/** hash = sha256(prevHash + canonical JSON of the event). */
export function computeEventHash(e: HashedFields): string {
  const payload = {
    agreementId: e.agreementId,
    seq: e.seq,
    type: e.type,
    ip: e.ip,
    userAgent: e.userAgent,
    deviceInfo: e.deviceInfo,
    metadata: e.metadata,
    createdAt: e.createdAt.toISOString(),
  };
  return sha256Hex(e.prevHash + canonicalJson(payload));
}

/**
 * Appends one event to the agreement's chain. A per-agreement advisory lock serialises writers;
 * the unique (agreementId, seq) index is the backstop.
 */
export async function appendAuditEvent(
  agreementId: string,
  type: AuditEventType,
  ctx: RequestContext = {},
  metadata: Record<string, unknown> = {},
  tx?: Prisma.TransactionClient,
) {
  const run = async (t: Prisma.TransactionClient) => {
    await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${agreementId}))`;
    const last = await t.auditEvent.findFirst({
      where: { agreementId },
      orderBy: { seq: 'desc' },
      select: { seq: true, hash: true },
    });
    const fields: HashedFields = {
      agreementId,
      seq: (last?.seq ?? 0) + 1,
      type,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      // Round-trip through JSON so what we hash equals what Postgres gives back.
      deviceInfo: ctx.deviceInfo ? JSON.parse(JSON.stringify(ctx.deviceInfo)) : null,
      metadata: JSON.parse(JSON.stringify(metadata)),
      createdAt: new Date(),
      prevHash: last?.hash ?? GENESIS_HASH,
    };
    return t.auditEvent.create({
      data: {
        ...fields,
        deviceInfo: fields.deviceInfo ?? Prisma.DbNull,
        metadata: fields.metadata ?? Prisma.DbNull,
        hash: computeEventHash(fields),
      },
    });
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

/** Recomputes the chain. Events must belong to one agreement. */
export function verifyChain(
  events: AuditEvent[],
): { ok: true } | { ok: false; brokenAtSeq: number } {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  let prev = GENESIS_HASH;
  for (const [i, e] of sorted.entries()) {
    if (e.seq !== i + 1 || e.prevHash !== prev || computeEventHash(e) !== e.hash) {
      return { ok: false, brokenAtSeq: e.seq };
    }
    prev = e.hash;
  }
  return { ok: true };
}
