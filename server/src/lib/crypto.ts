import { createHash, randomBytes } from 'node:crypto';

export const sha256Hex = (data: string | Uint8Array) =>
  createHash('sha256').update(data).digest('hex');

/** 32 random bytes, base64url. Only the SHA-256 hash is ever stored. */
export function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256Hex(token) };
}

/** Deterministic JSON: object keys sorted recursively (Postgres jsonb reorders keys). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}
