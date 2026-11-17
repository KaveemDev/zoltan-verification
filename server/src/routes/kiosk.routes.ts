import express, { Router, type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { createAgreementSchema } from '../shared/index.js';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { HttpError } from '../errors.js';
import { requestContext } from '../lib/request.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import {
  attachOriginalPdf,
  createAgreement,
  getAgreementOrThrow,
} from '../services/agreement.service.js';

/**
 * Customer device ("kiosk") mode. When an admin saves the device setup, the device gets a long-lived
 * token that can ONLY create agreements from that template at those prices, and attach their PDF.
 * The device keeps working after the admin signs out or closes the app, until the setup is saved again.
 * It stops working if the template is deactivated or the admin who saved it is deactivated or demoted.
 * shortcut: no per-device revoke list; a lost device's token works until it expires (KIOSK_TTL_SEC)
 * unless one of the above happens. Add a DeviceToken table if devices need revoking one by one.
 */
export const KIOSK_TTL_SEC = 180 * 24 * 60 * 60;

const price = createAgreementSchema.shape.price;
export const kioskSetupSchema = z.object({
  templateId: z.string().min(1).max(100),
  currency: createAgreementSchema.shape.currency,
  prices: z.object({ VISA: price.optional(), TRAVEL: price.optional(), BOTH: price.optional() }),
});
type KioskSetup = z.output<typeof kioskSetupSchema>;

const customerSchema = createAgreementSchema.pick({
  customerName: true,
  customerPhone: true,
  customerEmail: true,
  packageType: true,
  destination: true,
  notes: true,
});

interface KioskClaims extends KioskSetup {
  typ: 'kiosk';
  sub: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    kiosk?: KioskClaims;
  }
}

const notSetUp = () =>
  new HttpError(401, 'This device needs to be set up again by an admin.', 'KIOSK_SETUP_INVALID');

/** Bearer device token, issued by an admin who is still an active admin. */
const requireKiosk: RequestHandler = async (req, _res, next) => {
  const token = req.get('authorization')?.replace(/^Bearer /, '');
  let claims: KioskClaims;
  try {
    claims = jwt.verify(token ?? '', env.JWT_SECRET, { algorithms: ['HS256'] }) as KioskClaims;
  } catch {
    throw notSetUp();
  }
  if (claims.typ !== 'kiosk' || typeof claims.sub !== 'string') throw notSetUp();
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { active: true, role: true },
  });
  if (!user?.active || user.role !== 'ADMIN') throw notSetUp();
  req.kiosk = claims;
  next();
};

export const kioskRouter = Router();

// Admin saves the device setup: returns the device token (shown once, stored on the device).
kioskRouter.post('/token', requireAuth, requireCsrf, requireRole('ADMIN'), async (req, res) => {
  const setup = kioskSetupSchema.parse(req.body);
  const template = await prisma.agreementTemplate.findFirst({
    where: { id: setup.templateId, active: true },
  });
  if (!template) throw new HttpError(400, 'Template not found or inactive', 'TEMPLATE_NOT_FOUND');
  const claims: KioskClaims = { typ: 'kiosk', sub: req.user!.sub, ...setup };
  res.json({
    token: jwt.sign(claims, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: KIOSK_TTL_SEC }),
    expiresAt: new Date(Date.now() + KIOSK_TTL_SEC * 1000).toISOString(),
  });
});

// Step 1 on the device: the customer's details plus the admin's template and price.
kioskRouter.post('/agreements', requireKiosk, async (req, res) => {
  const k = req.kiosk!;
  const customer = customerSchema.parse(req.body);
  const amount = k.prices[customer.packageType];
  if (!amount) {
    throw new HttpError(400, 'This package is not offered on this device.', 'PACKAGE_NOT_OFFERED');
  }
  const input = createAgreementSchema.parse({
    ...customer,
    price: amount,
    currency: k.currency,
    templateId: k.templateId,
  });
  res.status(201).json(await createAgreement(input, k.sub));
});

// Step 2: the device uploads the PDF; no email, the signing token comes back for on-device signing.
kioskRouter.post(
  '/agreements/:id/original-pdf',
  requireKiosk,
  express.raw({ type: 'application/pdf', limit: '10mb' }),
  async (req, res) => {
    const k = req.kiosk!;
    const id = String(req.params.id);
    const a = await getAgreementOrThrow(id);
    // A device token only reaches agreements made with its own setup.
    if (a.createdById !== k.sub || a.templateId !== k.templateId) {
      throw new HttpError(404, 'Agreement not found', 'NOT_FOUND');
    }
    const pdf = Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : new Uint8Array();
    res.json(await attachOriginalPdf(id, pdf, k.sub, requestContext(req), { kiosk: true }));
  },
);
