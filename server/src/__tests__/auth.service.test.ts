import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { safeEqual } from '../middleware/csrf.js';
import { hashPassword, signStaffToken, verifyStaffToken } from '../services/auth.service.js';
import argon2 from 'argon2';

describe('auth.service', () => {
  it('hashes with argon2id and verifies', async () => {
    const h = await hashPassword('correct horse battery');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await argon2.verify(h, 'correct horse battery')).toBe(true);
    expect(await argon2.verify(h, 'wrong')).toBe(false);
  });

  it('round-trips a staff token', () => {
    const t = signStaffToken({ id: 'u1', role: 'ADMIN' });
    expect(verifyStaffToken(t)).toEqual({ sub: 'u1', role: 'ADMIN' });
  });

  it('rejects tokens with a wrong secret, bad role, or alg none', () => {
    expect(verifyStaffToken(jwt.sign({ sub: 'u1', role: 'ADMIN' }, 'x'.repeat(40)))).toBeNull();
    expect(
      verifyStaffToken(jwt.sign({ sub: 'u1', role: 'ROOT' }, process.env.JWT_SECRET!)),
    ).toBeNull();
    const none = jwt.sign({ sub: 'u1', role: 'ADMIN' }, '', { algorithm: 'none' });
    expect(verifyStaffToken(none)).toBeNull();
  });

  it('safeEqual compares strings of different lengths without throwing', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
