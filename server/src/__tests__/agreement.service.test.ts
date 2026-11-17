import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../lib/crypto.js';
import { createFakePrisma } from './fakePrisma.js';

const db = createFakePrisma();
vi.mock('../db.js', () => ({ prisma: db }));

const uploads = new Map<string, Uint8Array>();
vi.mock('../services/storage.service.js', async (orig) => ({
  ...(await orig<object>()),
  putObject: vi.fn(async (key: string, body: Uint8Array) => void uploads.set(key, body)),
}));
const sendEmail = vi.fn();
vi.mock('../messaging/index.js', () => ({ getEmail: () => ({ name: 'test', send: sendEmail }) }));

const { attachOriginalPdf, createAgreement } = await import('../services/agreement.service.js');

const input = {
  customerName: 'Asha <b>Rao</b>',
  customerPhone: '+919876543210',
  customerEmail: 'asha@example.com',
  packageType: 'VISA' as const,
  destination: 'Canada',
  price: 25000,
  currency: 'INR',
  templateId: 't1',
};
const realPdf = async () => {
  const d = await PDFDocument.create();
  d.addPage([595, 842]);
  return d.save();
};
const row = (id: string) => db.agreement.rows.find((a) => a.id === id)!;
const types = (id: string) =>
  db.auditEvent.rows.filter((e) => e.agreementId === id).map((e) => e.type);

beforeEach(() => {
  for (const t of [db.agreement, db.auditEvent, db.user, db.agreementTemplate]) t.rows.length = 0;
  uploads.clear();
  sendEmail.mockReset();
  db.user.rows.push({ id: 'u1', name: 'Priya Staff', email: 'p@example.com', role: 'STAFF' });
  db.agreementTemplate.rows.push({
    id: 't1',
    name: 'Visa Assistance Agreement',
    version: 3,
    active: true,
    bodyHtml: '<p>{{customerName}} {{agreementId}} by {{issuedBy}}</p>',
  });
});

describe('createAgreement (step 1)', () => {
  it('saves a DRAFT and returns the filled, escaped HTML; nothing is stored or sent yet', async () => {
    const draft = await createAgreement(input, 'u1');
    expect(draft.html).toBe(`<p>Asha &lt;b&gt;Rao&lt;/b&gt; ${draft.id} by Priya Staff</p>`);
    expect(draft.footer).toBe(`Test Travel · Agreement ${draft.id}`);
    expect(row(draft.id)).toMatchObject({
      status: 'DRAFT',
      templateVersion: 3,
      price: '25000.00',
      createdById: 'u1',
    });
    expect(row(draft.id).signingTokenHash ?? null).toBeNull();
    expect(row(draft.id).originalPdfKey ?? null).toBeNull();
    expect(uploads.size).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(types(draft.id)).toEqual([]);
  });

  it('rejects an unknown or inactive template', async () => {
    await expect(createAgreement({ ...input, templateId: 'nope' }, 'u1')).rejects.toMatchObject({
      status: 400,
    });
    expect(db.agreement.rows).toEqual([]);
  });
});

describe('attachOriginalPdf (step 2)', () => {
  it('stores the PDF and its hash, stores only the token hash, emails the link and marks SENT', async () => {
    sendEmail.mockResolvedValue({ messageId: 'm1' });
    const { id } = await createAgreement(input, 'u1');
    const pdf = await realPdf();
    const res = await attachOriginalPdf(id, pdf, 'u1', { ip: '1.1.1.1' });

    const a = row(id);
    expect(uploads.get(`agreements/${id}/original.pdf`)).toEqual(pdf);
    expect(a.originalPdfSha256).toBe(sha256Hex(pdf));

    const msg = sendEmail.mock.calls[0]![0];
    expect(msg.to).toEqual({ email: 'asha@example.com', name: 'Asha <b>Rao</b>' });
    const token = msg.text.match(/http:\/\/localhost:5173\/sign\/([\w-]+)/)![1]!;
    expect(msg.html).toContain(`href="http://localhost:5173/sign/${token}"`);
    expect(a.signingTokenHash).toBe(sha256Hex(token));
    expect(JSON.stringify(db.agreement.rows)).not.toContain(token);
    expect((a.tokenExpiresAt as Date).getTime() - Date.now()).toBeGreaterThan(71.9 * 3_600_000);

    expect(types(id)).toEqual(['CREATED', 'MESSAGE_SENT']);
    expect(db.auditEvent.rows[0]!.metadata).toMatchObject({
      originalPdfSha256: sha256Hex(pdf),
      createdById: 'u1',
      pages: 1,
    });
    expect(res.status).toBe('SENT');
  });

  it('kiosk mode sends no email, marks SENT and returns the signing token once', async () => {
    const { id } = await createAgreement(input, 'u1');
    const res = await attachOriginalPdf(id, await realPdf(), 'u1', {}, { kiosk: true });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(res.status).toBe('SENT');
    expect(row(id).signingTokenHash).toBe(sha256Hex(res.signingToken!));
    expect(JSON.stringify(db.agreement.rows)).not.toContain(res.signingToken!);
    expect(types(id)).toEqual(['CREATED']);
  });

  it('rejects anything that is not a real PDF, and stores nothing', async () => {
    const { id } = await createAgreement(input, 'u1');
    for (const bad of [new Uint8Array(), new TextEncoder().encode('%PDF-not really')]) {
      await expect(attachOriginalPdf(id, bad, 'u1', {})).rejects.toMatchObject({ status: 400 });
    }
    expect(uploads.size).toBe(0);
    expect(row(id).status).toBe('DRAFT');
  });

  it('accepts the PDF only once', async () => {
    sendEmail.mockResolvedValue({ messageId: 'm1' });
    const { id } = await createAgreement(input, 'u1');
    await attachOriginalPdf(id, await realPdf(), 'u1', {});
    await expect(attachOriginalPdf(id, await realPdf(), 'u1', {})).rejects.toMatchObject({
      status: 409,
    });
    expect(types(id)).toEqual(['CREATED', 'MESSAGE_SENT']);
  });

  it('keeps DRAFT and logs MESSAGE_FAILED when the email fails (the PDF stays stored)', async () => {
    sendEmail.mockRejectedValue(new Error('network down'));
    const { id } = await createAgreement(input, 'u1');
    const res = await attachOriginalPdf(id, await realPdf(), 'u1', {});
    expect(types(id)).toEqual(['CREATED', 'MESSAGE_FAILED']);
    expect(res.status).toBe('DRAFT');
    expect(row(id).originalPdfKey).toBe(`agreements/${id}/original.pdf`);
  });
});
