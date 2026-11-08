import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { signStaffToken } from '../services/auth.service.js';

const createAgreement = vi.fn(async () => ({ id: 'a1', status: 'SENT' }));
vi.mock('../services/agreement.service.js', () => ({
  createAgreement,
  listAgreements: vi.fn(async (q: unknown) => ({ items: [], total: 0, ...(q as object) })),
  listActiveTemplates: vi.fn(async () => []),
}));

vi.mock('../db.js', () => ({
  prisma: { user: { findUnique: vi.fn(async () => ({ active: true, role: 'STAFF' })) } },
}));

const { createApp } = await import('../app.js');
const app = createApp();
const session = signStaffToken({ id: 'u1', role: 'STAFF' });
const auth = { Cookie: `session=${session}; csrf=tok`, 'x-csrf-token': 'tok' };

const valid = {
  customerName: 'Asha Rao',
  customerPhone: '+919876543210',
  customerEmail: ' Asha@Example.com ',
  packageType: 'BOTH',
  destination: 'Canada',
  price: '1999.50',
  currency: 'inr',
  templateId: 't1',
};

describe('agreements routes', () => {
  it('requires a session and a CSRF token', async () => {
    await request(app).get('/api/v1/agreements').expect(401);
    await request(app)
      .post('/api/v1/agreements')
      .set('Cookie', `session=${session}`)
      .send(valid)
      .expect(403);
  });

  it('validates input', async () => {
    const res = await request(app)
      .post('/api/v1/agreements')
      .set(auth)
      .send({ ...valid, customerPhone: '98765 43210', price: '10.123' })
      .expect(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['customerPhone', 'price']);
    expect(createAgreement).not.toHaveBeenCalled();
  });

  it('creates with normalised input and the caller as creator', async () => {
    await request(app).post('/api/v1/agreements').set(auth).send(valid).expect(201);
    expect(createAgreement).toHaveBeenCalledWith(
      expect.objectContaining({
        price: 1999.5,
        currency: 'INR',
        customerEmail: 'asha@example.com',
        packageType: 'BOTH',
      }),
      'u1',
      expect.objectContaining({ ip: expect.any(String) }),
    );
  });

  it('parses list query params', async () => {
    const res = await request(app)
      .get('/api/v1/agreements?status=SENT&page=2')
      .set(auth)
      .expect(200);
    expect(res.body).toMatchObject({ status: 'SENT', page: 2, pageSize: 20 });
    await request(app).get('/api/v1/agreements?status=BOGUS').set(auth).expect(400);
  });
});
