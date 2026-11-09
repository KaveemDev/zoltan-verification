import { describe, expect, it } from 'vitest';
import { canonicalJson, generateToken, sha256Hex } from '../lib/crypto.js';

describe('crypto', () => {
  it('canonicalJson ignores key order at every depth and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [{ y: 1, x: 2 }], c: null }, u: undefined })).toBe(
      canonicalJson({ a: { c: null, d: [{ x: 2, y: 1 }] }, b: 1 }),
    );
  });

  it('generateToken gives 32 random bytes as base64url and its sha256', () => {
    const { token, hash } = generateToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(sha256Hex(token));
    expect(generateToken().token).not.toBe(token);
  });
});
