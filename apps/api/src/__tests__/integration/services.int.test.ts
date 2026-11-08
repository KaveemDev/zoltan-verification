/**
 * Integration checks the unit tests can't make with the in-memory fake:
 * the append-only trigger, jsonb round-trips through the hash chain, and S3/MinIO/R2 enforcing
 * what the presigned upload URL signs.
 *
 *   docker compose up -d && npm run db:deploy && npm run test:integration -w apps/api
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../db.js';
import { env } from '../../env.js';
import { sha256Hex } from '../../lib/crypto.js';
import { appendAuditEvent, verifyChain } from '../../services/audit.service.js';
import {
  deleteObject,
  headObject,
  presignGet,
  presignPut,
  sha256OfObject,
} from '../../services/storage.service.js';

const run = randomUUID().slice(0, 8);
const agreementId = `int-${run}`;
const userId = `int-user-${run}`;
const templateId = `int-tpl-${run}`;

const purgeEvents = (id: string) =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.allow_audit_purge', 'on', true)`;
    return tx.auditEvent.deleteMany({ where: { agreementId: id } });
  });

beforeAll(async () => {
  await prisma.user.create({
    data: { id: userId, name: 'Integration', email: `${userId}@example.test`, passwordHash: 'x' },
  });
  await prisma.agreementTemplate.create({
    data: { id: templateId, name: `Integration ${run}`, version: 1, bodyHtml: '<p>x</p>' },
  });
  await prisma.agreement.create({
    data: {
      id: agreementId,
      customerName: 'Integration Test',
      customerPhone: '+919999999999',
      packageType: 'VISA',
      destination: 'Nowhere',
      price: '1.00',
      currency: 'INR',
      templateId,
      templateVersion: 1,
      createdById: userId,
    },
  });
});

afterAll(async () => {
  await purgeEvents(agreementId);
  await prisma.agreement.delete({ where: { id: agreementId } });
  await prisma.agreementTemplate.delete({ where: { id: templateId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('audit trail in Postgres', () => {
  it('keeps the hash chain valid through jsonb (key order, floats, nesting, ms timestamps)', async () => {
    await appendAuditEvent(
      agreementId,
      'OPENED',
      {
        ip: '203.0.113.7',
        userAgent: 'IntTest/1.0',
        deviceInfo: { timezone: 'Asia/Kolkata', screen: '390x844', dpr: 2.75 },
      },
      { zeta: 1, alpha: { b: [3, 2, 1], a: 'x' }, ratio: 8.4, nothing: null },
    );
    await appendAuditEvent(agreementId, 'MESSAGE_SENT', {}, { messageId: `wamid.${run}` });
    await appendAuditEvent(
      agreementId,
      'AGREEMENT_VIEWED',
      {},
      { pagesViewed: 3, totalPages: 3, secondsOnPage: 0.1 },
    );
    const events = await prisma.auditEvent.findMany({
      where: { agreementId },
      orderBy: { seq: 'asc' },
    });
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(verifyChain(events)).toEqual({ ok: true });
  });

  it('rejects UPDATE, DELETE and TRUNCATE on AuditEvent', async () => {
    const e = await prisma.auditEvent.findFirstOrThrow({ where: { agreementId } });
    await expect(
      prisma.auditEvent.update({ where: { id: e.id }, data: { ip: '10.0.0.1' } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.auditEvent.delete({ where: { id: e.id } })).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe('TRUNCATE "AuditEvent"')).rejects.toThrow(/append-only/);
  });

  it('allows DELETE only inside a purge transaction, and only for that transaction', async () => {
    const other = `${agreementId}-purge`;
    await prisma.agreement.create({
      data: {
        ...(await prisma.agreement.findUniqueOrThrow({ where: { id: agreementId } })),
        id: other,
        signingTokenHash: null,
      },
    });
    await appendAuditEvent(other, 'OPENED');
    expect((await purgeEvents(other)).count).toBe(1);
    // The setting was transaction-local: plain deletes are blocked again.
    const e = await prisma.auditEvent.findFirstOrThrow({ where: { agreementId } });
    await expect(prisma.auditEvent.delete({ where: { id: e.id } })).rejects.toThrow(/append-only/);
    await prisma.agreement.delete({ where: { id: other } });
  });
});

describe('object storage', () => {
  const key = `integration/${run}/video.webm`;
  const body = new Uint8Array(20_000).map((_, i) => i % 251);

  afterAll(() => deleteObject(key));

  it('enforces the signed Content-Type and Content-Length on presigned PUTs', async () => {
    const url = await presignPut(key, 'video/webm', body.length, 600);
    const put = (b: Uint8Array<ArrayBuffer>, type: string) =>
      fetch(url, { method: 'PUT', body: new Blob([b]), headers: { 'Content-Type': type } });

    expect((await put(body, 'video/mp4')).ok).toBe(false);
    expect((await put(body.slice(1), 'video/webm')).ok).toBe(false);
    expect(await headObject(key)).toBeNull();

    const ok = await put(body, 'video/webm');
    expect(ok.status).toBe(200);
  });

  it('stores it encrypted and hashes it server-side', async () => {
    const head = await headObject(key);
    expect(head?.sizeBytes).toBe(body.length);
    if (env.S3_SSE !== 'none') expect(head?.encryption).toBeTruthy();
    expect(await sha256OfObject(key)).toBe(sha256Hex(body));
  });

  it('serves it back through a short-lived presigned GET', async () => {
    const res = await fetch(await presignGet(key, 60, 'video/webm'));
    expect(res.headers.get('content-type')).toBe('video/webm');
    expect(sha256Hex(new Uint8Array(await res.arrayBuffer()))).toBe(sha256Hex(body));
  });
});
