import type { AuditEvent } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { computeEventHash, GENESIS_HASH, verifyChain } from '../services/audit.service.js';

function chain(n: number): AuditEvent[] {
  const out: AuditEvent[] = [];
  let prevHash = GENESIS_HASH;
  for (let seq = 1; seq <= n; seq++) {
    const e = {
      id: `e${seq}`,
      agreementId: 'a1',
      seq,
      type: 'OPENED',
      ip: '1.2.3.4',
      userAgent: 'ua',
      deviceInfo: { screen: '390x844', tz: 'Asia/Kolkata' },
      metadata: { n: seq, nested: { b: 2, a: 1 } },
      createdAt: new Date(1_700_000_000_000 + seq),
      prevHash,
      hash: '',
    };
    e.hash = computeEventHash(e);
    prevHash = e.hash;
    out.push(e);
  }
  return out;
}

describe('audit chain', () => {
  it('verifies an intact chain regardless of input order or JSON key order', () => {
    const events = chain(4);
    events[1]!.metadata = { nested: { a: 1, b: 2 }, n: 2 }; // what jsonb might return
    expect(verifyChain(events.reverse())).toEqual({ ok: true });
  });

  it('detects edited metadata', () => {
    const events = chain(3);
    events[1]!.metadata = { n: 999 };
    expect(verifyChain(events)).toEqual({ ok: false, brokenAtSeq: 2 });
  });

  it('detects a deleted event', () => {
    const events = chain(3);
    events.splice(1, 1);
    expect(verifyChain(events)).toEqual({ ok: false, brokenAtSeq: 3 });
  });

  it('detects a recomputed hash that breaks the link to the next event', () => {
    const events = chain(3);
    events[0]!.ip = '9.9.9.9';
    events[0]!.hash = computeEventHash(events[0]!);
    expect(verifyChain(events)).toEqual({ ok: false, brokenAtSeq: 2 });
  });
});
