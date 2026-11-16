import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma.js';

const db = createFakePrisma();
vi.mock('../db.js', () => ({ prisma: db }));

const { expireLinks, flagRetention } = await import('../services/jobs.service.js');

const NOW = new Date('2026-11-07T12:00:00Z');
const yearsAgo = (y: number) => new Date(NOW.getTime() - y * 365.25 * 86_400_000);
const add = (id: string, fields: Record<string, unknown>) =>
  db.agreement.rows.push({
    id,
    status: 'SENT',
    createdAt: NOW,
    signedAt: null,
    retentionDueAt: null,
    purgedAt: null,
    ...fields,
  });
const row = (id: string) => db.agreement.rows.find((a) => a.id === id)!;

beforeEach(() => {
  db.agreement.rows.length = 0;
  db.auditEvent.rows.length = 0;
});

describe('expireLinks', () => {
  it('expires only open agreements past their link expiry, once', async () => {
    add('past', { tokenExpiresAt: new Date(NOW.getTime() - 1000), status: 'OPENED' });
    add('future', { tokenExpiresAt: new Date(NOW.getTime() + 1000) });
    add('signed', { tokenExpiresAt: new Date(NOW.getTime() - 1000), status: 'SIGNED' });
    add('cancelled', { tokenExpiresAt: new Date(NOW.getTime() - 1000), status: 'CANCELLED' });

    expect(await expireLinks(NOW)).toBe(1);
    expect(await expireLinks(NOW)).toBe(0);
    expect(['past', 'future', 'signed', 'cancelled'].map((id) => row(id).status)).toEqual([
      'EXPIRED',
      'SENT',
      'SIGNED',
      'CANCELLED',
    ]);
    expect(db.auditEvent.rows.map((e) => `${e.agreementId}:${e.type}`)).toEqual(['past:EXPIRED']);
  });
});

describe('flagRetention', () => {
  it('flags closed records past RETENTION_YEARS (3) after signing, or creation if never signed', async () => {
    add('signed-old', { status: 'SIGNED', signedAt: yearsAgo(3.1), createdAt: yearsAgo(3.2) });
    add('signed-recent', { status: 'SIGNED', signedAt: yearsAgo(2.9), createdAt: yearsAgo(4) });
    add('cancelled-old', { status: 'CANCELLED', createdAt: yearsAgo(3.5) });
    add('open-old', { status: 'SENT', createdAt: yearsAgo(5) });
    add('purged', { status: 'SIGNED', signedAt: yearsAgo(4), purgedAt: yearsAgo(0.5) });
    add('already', { status: 'SIGNED', signedAt: yearsAgo(4), retentionDueAt: yearsAgo(0.9) });

    expect(await flagRetention(NOW)).toBe(2);
    const flagged = db.agreement.rows
      .filter((a) => a.retentionDueAt?.valueOf() === NOW.valueOf())
      .map((a) => a.id);
    expect(flagged).toEqual(['signed-old', 'cancelled-old']);
    expect(row('already').retentionDueAt).toEqual(yearsAgo(0.9));
    expect(await flagRetention(NOW)).toBe(0);
  });
});
