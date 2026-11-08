import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import type { Me, Role } from '@app/shared';
import { prisma } from '../db.js';
import { env } from '../env.js';

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_SEC = 8 * 60 * 60;

export interface StaffClaims {
  sub: string;
  role: Role;
}

// Verified against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = argon2.hash('dummy-password-for-timing');

export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });

/** Returns the user on valid credentials, otherwise null. */
export async function verifyCredentials(email: string, password: string): Promise<Me | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await argon2.verify(await DUMMY_HASH, password);
    return null;
  }
  if (!(await argon2.verify(user.passwordHash, password)) || !user.active) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function signStaffToken(user: Pick<Me, 'id' | 'role'>): string {
  const claims: StaffClaims = { sub: user.id, role: user.role };
  return jwt.sign(claims, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: SESSION_TTL_SEC });
}

export function verifyStaffToken(token: string): StaffClaims | null {
  try {
    const c = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (typeof c.sub !== 'string' || (c.role !== 'ADMIN' && c.role !== 'STAFF')) return null;
    return { sub: c.sub, role: c.role };
  } catch {
    return null;
  }
}

export async function getMe(id: string): Promise<Me | null> {
  const u = await prisma.user.findUnique({ where: { id } });
  return u && { id: u.id, name: u.name, email: u.email, role: u.role };
}
