import argon2 from 'argon2';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateToken } from '../lib/crypto.js';
import { createFakePrisma } from './fakePrisma.js';

const db = createFakePrisma();
vi.mock('../db.js', () => ({ prisma: db }));
const deleteObject = vi.fn(async (_key: string) => undefined);
vi.mock('../services/storage.service.js', async (orig) => ({
  ...(await orig<object>()),
  deleteObject,
}));

const { createApp } = await import('../app.js');
const { signStaffToken } = await import('../services/auth.service.js');
const { appendAuditEvent } = await import('../services/audit.service.js');
const app = createApp();

const as = (id: string, role: 'ADMIN' | 'STAFF' = 'ADMIN') => ({
  Cookie: `session=${signStaffToken({ id, role })}; csrf=t`,
  'x-csrf-token': 't',
});
const admin = as('admin1');
const staff = as('staff1', 'STAFF');
let passwordHash: string;
const user = (id: string) => db.user.rows.find((u) => u.id === id)!;

beforeAll(async () => {
  passwordHash = await argon2.hash('correct-horse-battery');
});

beforeEach(() => {
  for (const t of [
    db.user,
    db.agreement,
    db.auditEvent,
    db.otpChallenge,
    db.accessLog,
    db.agreementTemplate,
  ])
    t.rows.length = 0;
  deleteObject.mockClear();
  const base = { passwordHash, active: true, createdAt: new Date('2026-01-01') };
  db.user.rows.push(
    { id: 'admin1', name: 'Anil Admin', email: 'anil@example.com', role: 'ADMIN', ...base },
    { id: 'staff1', name: 'Priya Staff', email: 'priya@example.com', role: 'STAFF', ...base },
  );
});

describe('admin-only access', () => {
  it('blocks staff from admin endpoints', async () => {
    await request(app).get('/api/v1/users').set(staff).expect(403);
    await request(app).get('/api/v1/access-log').set(staff).expect(403);
    await request(app).get('/api/v1/retention').set(staff).expect(403);
    await request(app)
      .post('/api/v1/templates')
      .set(staff)
      .send({ name: 'x', bodyHtml: 'y' })
      .expect(403);
    await request(app).get('/api/v1/users').expect(401);
  });
});

describe('users', () => {
  it('creates users without exposing password hashes', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set(admin)
      .send({
        name: 'Ravi',
        email: 'RAVI@example.com',
        role: 'STAFF',
        password: 'long-enough-pass',
      })
      .expect(201);
    expect(res.body).toMatchObject({
      name: 'Ravi',
      email: 'ravi@example.com',
      role: 'STAFF',
      active: true,
    });
    const list = await request(app).get('/api/v1/users').set(admin).expect(200);
    expect(JSON.stringify(list.body)).not.toContain('argon2');
    expect(list.body).toHaveLength(3);
    await request(app)
      .post('/api/v1/users')
      .set(admin)
      .send({ name: 'X', email: 'x@example.com', role: 'STAFF', password: 'short' })
      .expect(400);
  });

  it('deactivation ends existing sessions and blocks sign-in', async () => {
    await request(app).get('/api/v1/agreements').set(staff).expect(200);
    await request(app).patch('/api/v1/users/staff1').set(admin).send({ active: false }).expect(200);
    await request(app).get('/api/v1/agreements').set(staff).expect(401);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'priya@example.com', password: 'correct-horse-battery' })
      .expect(401);
  });

  it('applies role changes immediately, even with an older session token', async () => {
    const tokenSaysAdmin = as('staff1', 'ADMIN');
    await request(app).get('/api/v1/users').set(tokenSaysAdmin).expect(403);
    await request(app).patch('/api/v1/users/staff1').set(admin).send({ role: 'ADMIN' }).expect(200);
    await request(app).get('/api/v1/users').set(staff).expect(200);
  });

  it('stops admins locking themselves out', async () => {
    await request(app).patch('/api/v1/users/admin1').set(admin).send({ active: false }).expect(400);
    await request(app).patch('/api/v1/users/admin1').set(admin).send({ role: 'STAFF' }).expect(400);
    await request(app).patch('/api/v1/users/admin1').set(admin).send({}).expect(400);
  });

  it('resets passwords', async () => {
    await request(app)
      .patch('/api/v1/users/staff1')
      .set(admin)
      .send({ password: 'a-brand-new-password' })
      .expect(200);
    expect(await argon2.verify(user('staff1').passwordHash as string, 'a-brand-new-password')).toBe(
      true,
    );
  });
});

describe('templates', () => {
  const body = '<h1>Agreement</h1><p>{{customerName}} {{custmerPhone}}</p>';

  it('saves new versions, retires the old one, and flags unknown placeholders', async () => {
    const v1 = await request(app)
      .post('/api/v1/templates')
      .set(admin)
      .send({ name: 'Visa', bodyHtml: body })
      .expect(201);
    expect(v1.body.template).toMatchObject({ name: 'Visa', version: 1, active: true });
    expect(v1.body.unknownPlaceholders).toEqual(['custmerPhone']);
    const v2 = await request(app)
      .post('/api/v1/templates')
      .set(admin)
      .send({ name: 'Visa', bodyHtml: body + '<p>v2</p>' })
      .expect(201);
    expect(v2.body.template.version).toBe(2);

    const all = await request(app).get('/api/v1/templates?all=1').set(admin).expect(200);
    expect(
      all.body.map((t: { version: number; active: boolean }) => [t.version, t.active]),
    ).toEqual([
      [2, true],
      [1, false],
    ]);
    const forStaff = await request(app).get('/api/v1/templates?all=1').set(staff).expect(200);
    expect(forStaff.body).toEqual([{ id: v2.body.template.id, name: 'Visa', version: 2 }]);

    const full = await request(app)
      .get(`/api/v1/templates/${v1.body.template.id}`)
      .set(admin)
      .expect(200);
    expect(full.body.bodyHtml).toBe(body);
  });
});

describe('retention and purge', () => {
  const token = generateToken();
  async function seed(status = 'SIGNED') {
    db.agreement.rows.push({
      id: 'a1',
      customerName: 'Asha Rao',
      customerPhone: '+919876543210',
      customerEmail: 'asha@example.com',
      notes: 'Passport ends 2030',
      packageType: 'VISA',
      destination: 'Canada',
      status,
      createdAt: new Date('2022-01-01'),
      signedAt: new Date('2022-01-02'),
      tokenExpiresAt: new Date('2022-01-04'),
      retentionDueAt: new Date('2025-01-03'),
      purgedAt: null,
      signingTokenHash: token.hash,
      originalPdfKey: 'agreements/a1/original.pdf',
      signedPdfKey: 'agreements/a1/signed-x.pdf',
      videoKey: 'agreements/a1/video-x.webm',
      originalPdfSha256: 'a'.repeat(64),
    });
    await appendAuditEvent('a1', 'OPENED', { ip: '49.36.1.1', userAgent: 'Phone' });
    await appendAuditEvent('a1', 'SIGNED', {}, { typedName: 'Asha Rao' });
    db.otpChallenge.rows.push({ id: 'o1', agreementId: 'a1', codeHash: 'h' });
  }

  it('lists records due for deletion', async () => {
    await seed();
    const res = await request(app).get('/api/v1/retention').set(admin).expect(200);
    expect(res.body).toEqual([
      expect.objectContaining({ id: 'a1', retentionDueAt: '2025-01-03T00:00:00.000Z' }),
    ]);
  });

  it('requires the typed ID and a closed agreement', async () => {
    await seed('VERIFIED');
    await request(app)
      .post('/api/v1/retention/a1/purge')
      .set(admin)
      .send({ confirmId: 'a2' })
      .expect(400);
    const open = await request(app)
      .post('/api/v1/retention/a1/purge')
      .set(admin)
      .send({ confirmId: 'a1' })
      .expect(409);
    expect(open.body.error).toBe('STILL_OPEN');
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('erases files, audit trail, OTPs and personal fields; keeps a logged tombstone', async () => {
    await seed();
    await request(app)
      .post('/api/v1/retention/a1/purge')
      .set(admin)
      .send({ confirmId: 'a1' })
      .expect(204);

    expect(deleteObject.mock.calls.map((c) => c[0])).toEqual([
      'agreements/a1/original.pdf',
      'agreements/a1/signed-x.pdf',
      'agreements/a1/video-x.webm',
    ]);
    expect(db.auditEvent.rows).toEqual([]);
    expect(db.otpChallenge.rows).toEqual([]);
    const a = db.agreement.rows[0]!;
    expect(a).toMatchObject({
      customerName: '[deleted]',
      customerPhone: '',
      customerEmail: null,
      notes: null,
      signingTokenHash: null,
      videoKey: null,
      purgedById: 'admin1',
      status: 'SIGNED',
      originalPdfSha256: 'a'.repeat(64),
    });
    expect(JSON.stringify(db.agreement.rows)).not.toMatch(/Asha|9876543210|asha@|Passport/);
    expect(db.accessLog.rows.map((r) => `${r.userId}:${r.action}:${r.agreementId}`)).toEqual([
      'admin1:PURGED:a1',
    ]);

    await request(app)
      .post('/api/v1/retention/a1/purge')
      .set(admin)
      .send({ confirmId: 'a1' })
      .expect(409);
    expect((await request(app).get(`/api/v1/sign/${token.token}`).expect(404)).body.error).toBe(
      'LINK_INVALID',
    );
    expect((await request(app).get('/api/v1/retention').set(admin).expect(200)).body).toEqual([]);
    const integrity = await request(app)
      .post('/api/v1/agreements/a1/verify-integrity')
      .set(admin)
      .expect(200);
    expect(integrity.body.checks[0].name).toBe('Purged');
    await request(app).get('/api/v1/agreements/a1/evidence-bundle').set(admin).expect(410);
    await request(app)
      .post('/api/v1/agreements/a1/extend')
      .set(admin)
      .send({ hours: 24 })
      .expect(409);
  });
});

describe('access log', () => {
  it('lists entries newest first with who did what', async () => {
    db.accessLog.rows.push(
      {
        id: 'l1',
        userId: 'staff1',
        agreementId: 'a1',
        action: 'VIDEO_VIEWED',
        ip: '1.1.1.1',
        createdAt: new Date('2026-11-01'),
      },
      {
        id: 'l2',
        userId: 'admin1',
        agreementId: 'a1',
        action: 'BUNDLE_DOWNLOADED',
        ip: '2.2.2.2',
        createdAt: new Date('2026-11-02'),
      },
    );
    const res = await request(app).get('/api/v1/access-log').set(admin).expect(200);
    expect(res.body.total).toBe(2);
    expect(
      res.body.items.map(
        (i: { user: { name: string }; action: string }) => `${i.user.name}:${i.action}`,
      ),
    ).toEqual(['Anil Admin:BUNDLE_DOWNLOADED', 'Priya Staff:VIDEO_VIEWED']);
  });
});
