import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../lib/crypto.js';

const created: Record<string, unknown>[] = [];
const statusUpdates: unknown[] = [];
const auditTypes: string[] = [];
const uploads: { key: string; body: Uint8Array }[] = [];
const sendEmail = vi.fn();

vi.mock('../db.js', () => {
  const tx = {
    agreement: {
      create: vi.fn(async ({ data }) => created.push(data)),
      updateMany: vi.fn(async (args) => statusUpdates.push(args)),
    },
  };
  return {
    prisma: {
      agreementTemplate: {
        findFirst: vi.fn(async ({ where }) =>
          where.id === 't1'
            ? { id: 't1', version: 3, bodyHtml: '<p>{{customerName}} {{agreementId}}</p>' }
            : null,
        ),
      },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      agreement: {
        findUniqueOrThrow: vi.fn(async () => ({
          ...created.at(-1),
          status: statusUpdates.length ? 'SENT' : 'DRAFT',
          tokenExpiresAt: created.at(-1)!.tokenExpiresAt,
        })),
      },
    },
  };
});
vi.mock('../services/storage.service.js', async (orig) => ({
  ...(await orig<object>()),
  putObject: vi.fn(async (key: string, body: Uint8Array) => uploads.push({ key, body })),
}));
vi.mock('../services/pdf.service.js', async (orig) => ({
  ...(await orig<object>()),
  renderPdf: vi.fn(async (html: string) => new TextEncoder().encode(`%PDF-fake ${html}`)),
}));
vi.mock('../services/audit.service.js', () => ({
  appendAuditEvent: vi.fn(async (_id: string, type: string) => auditTypes.push(type)),
}));
vi.mock('../messaging/index.js', () => ({ getEmail: () => ({ name: 'test', send: sendEmail }) }));

const { createAgreement } = await import('../services/agreement.service.js');

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

beforeEach(() => {
  created.length = statusUpdates.length = auditTypes.length = uploads.length = 0;
  sendEmail.mockReset();
});

describe('createAgreement', () => {
  it('stores the PDF and its hash, stores only the token hash, sends the link and marks SENT', async () => {
    sendEmail.mockResolvedValue({ messageId: 'm1' });
    const res = await createAgreement(input, 'u1', { ip: '1.1.1.1' });

    const row = created[0]!;
    expect(uploads[0]!.key).toBe(`agreements/${row.id}/original.pdf`);
    expect(row.originalPdfSha256).toBe(sha256Hex(uploads[0]!.body));
    expect(new TextDecoder().decode(uploads[0]!.body)).toContain('Asha &lt;b&gt;Rao&lt;/b&gt;');
    expect(row).toMatchObject({
      status: 'DRAFT',
      templateVersion: 3,
      price: '25000.00',
      createdById: 'u1',
    });

    const msg = sendEmail.mock.calls[0]![0];
    expect(msg.to).toEqual({ email: 'asha@example.com', name: 'Asha <b>Rao</b>' });
    expect(msg.subject).toBe('Please review and sign your agreement with Test Travel');
    const token = msg.text.match(/http:\/\/localhost:5173\/sign\/([\w-]+)/)![1]!;
    expect(msg.html).toContain(`href="http://localhost:5173/sign/${token}"`);
    expect(msg.html).toContain('Hi Asha &lt;b&gt;Rao&lt;/b&gt;'); // names are escaped in the HTML email
    expect(row.signingTokenHash).toBe(sha256Hex(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect((row.tokenExpiresAt as Date).getTime() - Date.now()).toBeGreaterThan(71.9 * 3_600_000);

    expect(statusUpdates).toEqual([
      { where: { id: row.id, status: 'DRAFT' }, data: { status: 'SENT' } },
    ]);
    expect(auditTypes).toEqual(['CREATED', 'MESSAGE_SENT']);
    expect(res.status).toBe('SENT');
  });

  it('keeps DRAFT and logs MESSAGE_FAILED when sending fails', async () => {
    sendEmail.mockRejectedValue(new Error('network down'));
    const res = await createAgreement(input, 'u1', {});
    expect(statusUpdates).toEqual([]);
    expect(auditTypes).toEqual(['CREATED', 'MESSAGE_FAILED']);
    expect(res.status).toBe('DRAFT');
  });

  it('rejects an unknown or inactive template before doing any work', async () => {
    await expect(createAgreement({ ...input, templateId: 'nope' }, 'u1', {})).rejects.toMatchObject(
      { status: 400 },
    );
    expect(uploads).toEqual([]);
  });
});
