import argon2 from 'argon2';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const users: Record<
  string,
  {
    id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'STAFF';
    passwordHash: string;
    active: boolean;
  }
> = {};

vi.mock('../db.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(
        async ({ where }: { where: { email?: string; id?: string } }) =>
          Object.values(users).find((u) => u.email === where.email || u.id === where.id) ?? null,
      ),
    },
  },
}));

const { createApp } = await import('../app.js');
const app = createApp();

beforeAll(async () => {
  users.a = {
    id: 'u1',
    name: 'Admin',
    email: 'admin@example.com',
    role: 'ADMIN',
    passwordHash: await argon2.hash('a-good-password'),
    active: true,
  };
});

const cookieValue = (setCookie: string[], name: string) =>
  setCookie
    .find((c) => c.startsWith(`${name}=`))!
    .split(';')[0]!
    .slice(name.length + 1);

describe('auth routes', () => {
  it('rejects bad credentials with 401 and invalid body with 400', async () => {
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'nope' })
      .expect(401);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'unknown@example.com', password: 'x' })
      .expect(401);
    await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' }).expect(400);
  });

  it('logs in, sets httpOnly session cookie, serves /me, and logout needs CSRF', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ADMIN@example.com', password: 'a-good-password' })
      .expect(200);
    const setCookie = login.headers['set-cookie'] as unknown as string[];
    expect(setCookie.find((c) => c.startsWith('session='))).toMatch(/HttpOnly/);
    const session = cookieValue(setCookie, 'session');
    const csrf = cookieValue(setCookie, 'csrf');

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `session=${session}`)
      .expect(200);
    expect(me.body).toEqual({ id: 'u1', name: 'Admin', email: 'admin@example.com', role: 'ADMIN' });

    await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', `session=${session}; csrf=${csrf}`)
      .expect(403);
    await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', `session=${session}; csrf=${csrf}`)
      .set('x-csrf-token', csrf)
      .expect(204);
  });

  it('returns 401 on /me without a session', async () => {
    await request(app).get('/api/v1/auth/me').expect(401);
  });
});
