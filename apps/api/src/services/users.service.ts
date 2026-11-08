import { Prisma } from '@prisma/client';
import type { CreateUser, UpdateUser, UserView } from '@app/shared';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { hashPassword } from './auth.service.js';

const view = (u: {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STAFF';
  active: boolean;
  createdAt: Date;
}): UserView => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  active: u.active,
  createdAt: u.createdAt.toISOString(),
});

export async function listUsers(): Promise<UserView[]> {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  return users.map(view);
}

export async function createUser(input: CreateUser): Promise<UserView> {
  try {
    const u = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        passwordHash: await hashPassword(input.password),
      },
    });
    return view(u);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new HttpError(409, 'A user with this email already exists.', 'EMAIL_TAKEN');
    }
    throw e;
  }
}

export async function updateUser(
  id: string,
  input: UpdateUser,
  actingAdminId: string,
): Promise<UserView> {
  if (id === actingAdminId && (input.active === false || input.role === 'STAFF')) {
    // Stops the last admin from locking everyone out by accident.
    throw new HttpError(400, "You can't deactivate or demote your own account.", 'SELF_LOCKOUT');
  }
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'User not found', 'NOT_FOUND');
  const u = await prisma.user.update({
    where: { id },
    data: {
      name: input.name,
      role: input.role,
      active: input.active,
      ...(input.password && { passwordHash: await hashPassword(input.password) }),
    },
  });
  return view(u);
}
