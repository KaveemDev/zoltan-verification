import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signStaffToken } from '../services/auth.service.js';

const createAgreement = vi.fn(async () => ({ id: 'a1', html: '<p>x</p>', footer: 'f' }));
const attachOriginalPdf = vi.fn(async () => ({ id: 'a1', status: 'SENT', signingToken: 'tok' }));
const agreement = { id: 'a1', createdById: 'admin1', templateId: 't1' };
vi.mock('../services/agreement.service.js', () => ({
  createAgreement,
  attachOriginalPdf,
  getAgreementOrThrow: vi.fn(async () => agreement),
}));

const users: Record<string, { active: boolean; role: string }> = {};
const templates: Record<string, { id: string; active: boolean }> = {
  t1: { id: 't1', active: true },
};
vi.mock('../db.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => users[where.id] ?? null),
    },
    agreementTemplate: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
        templates[where.id]?.active ? templates[where.id] : null,
      ),
    },
  },
}));

const { createApp } = await import('../app.js');
const app = createApp();
const staffAuth = (id: string, role: 'ADMIN' | 'STAFF') => ({
  Cookie: `session=${signStaffToken({ id, role })}; csrf=c`,
  'x-csrf-token': 'c',
});
const setup = { templateId: 't1', currency: 'inr', prices: { VISA: 25000, BOTH: '40000' } };
const customer = {
  customerName: 'Asha Rao',
  customerPhone: '+919876543210',
  customerEmail: 'asha@example.com',
  packageType: 'VISA',
  destination: 'Canada',
};
const deviceToken = async () =>
  (
    await request(app)
      .post('/api/v1/kiosk/token')
      .set(staffAuth('admin1', 'ADMIN'))
      .send(setup)
      .expect(200)
  ).body.token as string;

beforeEach(() => {
  users.admin1 = { active: true, role: 'ADMIN' };
  users.staff1 = { active: true, role: 'STAFF' };
  createAgreement.mockClear();
  attachOriginalPdf.mockClear();
});

describe('kiosk routes', () => {
  it('only an admin can save a device setup, for an active template', async () => {
    await request(app).post('/api/v1/kiosk/token').send(setup).expect(401);
    await request(app)
      .post('/api/v1/kiosk/token')
      .set(staffAuth('staff1', 'STAFF'))
      .send(setup)
      .expect(403);
    await request(app)
      .post('/api/v1/kiosk/token')
      .set(staffAuth('admin1', 'ADMIN'))
      .send({ ...setup, templateId: 'gone' })
      .expect(400);
    expect(await deviceToken()).toMatch(/^ey/);
  });

  it('creates agreements with the saved template and price, no staff session needed', async () => {
    const token = await deviceToken();
    await request(app).post('/api/v1/kiosk/agreements').send(customer).expect(401);
    await request(app)
      .post('/api/v1/kiosk/agreements')
      .set('authorization', `Bearer ${token}`)
      .send(customer)
      .expect(201);
    expect(createAgreement).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 't1',
        price: 25000,
        currency: 'INR',
        customerName: 'Asha Rao',
      }),
      'admin1',
    );
    // Not offered on this device; and the device can't choose its own price.
    await request(app)
      .post('/api/v1/kiosk/agreements')
      .set('authorization', `Bearer ${token}`)
      .send({ ...customer, packageType: 'TRAVEL' })
      .expect(400);
    await request(app)
      .post('/api/v1/kiosk/agreements')
      .set('authorization', `Bearer ${token}`)
      .send({ ...customer, packageType: 'BOTH', price: 1, templateId: 'other' })
      .expect(201);
    expect(createAgreement).toHaveBeenLastCalledWith(
      expect.objectContaining({ price: 40000, templateId: 't1' }),
      'admin1',
    );
  });

  it('attaches the PDF in kiosk mode, only for its own agreements', async () => {
    const token = await deviceToken();
    const pdf = Buffer.from('%PDF-1.4 x');
    await request(app)
      .post('/api/v1/kiosk/agreements/a1/original-pdf')
      .set('authorization', `Bearer ${token}`)
      .set('content-type', 'application/pdf')
      .send(pdf)
      .expect(200);
    expect((attachOriginalPdf.mock.calls.at(-1) as unknown[])[4]).toEqual({ kiosk: true });
    agreement.createdById = 'someone-else';
    await request(app)
      .post('/api/v1/kiosk/agreements/a1/original-pdf')
      .set('authorization', `Bearer ${token}`)
      .set('content-type', 'application/pdf')
      .send(pdf)
      .expect(404);
    agreement.createdById = 'admin1';
  });

  it('stops working when the admin is deactivated or demoted, and rejects staff session tokens', async () => {
    const token = await deviceToken();
    users.admin1 = { active: false, role: 'ADMIN' };
    const res = await request(app)
      .post('/api/v1/kiosk/agreements')
      .set('authorization', `Bearer ${token}`)
      .send(customer)
      .expect(401);
    expect(res.body.error).toBe('KIOSK_SETUP_INVALID');
    users.admin1 = { active: true, role: 'STAFF' };
    await request(app)
      .post('/api/v1/kiosk/agreements')
      .set('authorization', `Bearer ${token}`)
      .send(customer)
      .expect(401);
    users.admin1 = { active: true, role: 'ADMIN' };
    const staffSession = signStaffToken({ id: 'admin1', role: 'ADMIN' });
    await request(app)
      .post('/api/v1/kiosk/agreements')
      .set('authorization', `Bearer ${staffSession}`)
      .send(customer)
      .expect(401);
  });
});
