import { Readable } from 'node:stream';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../lib/crypto.js';
import { createFakePrisma } from './fakePrisma.js';

const db = createFakePrisma();
vi.mock('../db.js', () => ({ prisma: db }));

const bucket = new Map<string, Buffer>();
vi.mock('../services/storage.service.js', async (orig) => ({
  ...(await orig<object>()),
  sha256OfObject: async (key: string) => {
    if (!bucket.has(key)) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
    return sha256Hex(bucket.get(key)!);
  },
  getObjectStream: async (key: string) => Readable.from(bucket.get(key)!),
}));

const sent: { to: string; text: string }[] = [];
vi.mock('../messaging/index.js', () => ({
  getEmail: () => ({
    name: 'test',
    send: async (m: { to: { email: string }; text: string }) => {
      sent.push({ to: m.to.email, text: m.text });
      return { messageId: 'm' };
    },
  }),
}));

const { createApp } = await import('../app.js');
const { appendAuditEvent } = await import('../services/audit.service.js');
const { signStaffToken } = await import('../services/auth.service.js');

const app = createApp();
const auth = {
  Cookie: `session=${signStaffToken({ id: 'u1', role: 'STAFF' })}; csrf=t`,
  'x-csrf-token': 't',
};
const files = {
  original: Buffer.from('%PDF-original'),
  signed: Buffer.from('%PDF-signed-with-verification-page'),
  video: Buffer.from('webm-video-bytes'),
};
const row = (id: string) => db.agreement.rows.find((a) => a.id === id)!;
const types = (id: string) =>
  db.auditEvent.rows.filter((e) => e.agreementId === id).map((e) => e.type);
const access = () => db.accessLog.rows.map((r) => `${r.userId}:${r.action}:${r.agreementId}`);
const binary = (res: request.Response) => res.body as Buffer;
const asBuffer = (r: request.Test) =>
  r.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

function base(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    customerName: 'Asha Rao',
    customerPhone: '+919876543210',
    customerEmail: 'asha@example.com',
    packageType: 'VISA',
    destination: 'Canada',
    price: { toFixed: () => '25000.00' },
    currency: 'INR',
    notes: null,
    templateId: 't1',
    templateVersion: 1,
    consentTextVersion: null,
    status: 'SENT',
    signingTokenHash: sha256Hex(`token-${id}`),
    tokenExpiresAt: new Date(Date.now() + 3_600_000),
    originalPdfKey: `agreements/${id}/original.pdf`,
    originalPdfSha256: sha256Hex(files.original),
    signedPdfKey: null,
    signedPdfSha256: null,
    videoKey: null,
    videoSha256: null,
    videoMimeType: null,
    videoDurationSec: null,
    createdById: 'u1',
    createdAt: new Date('2026-11-01T10:00:00Z'),
    signedAt: null,
    ...extra,
  };
}

/** A fully signed agreement with all three files stored and a consistent audit trail. */
async function seedSigned(id = 'signed-1') {
  const keys = {
    original: `agreements/${id}/original.pdf`,
    signed: `agreements/${id}/signed-x.pdf`,
    video: `agreements/${id}/video-x.webm`,
  };
  const hashes = {
    original: sha256Hex(files.original),
    signed: sha256Hex(files.signed),
    video: sha256Hex(files.video),
  };
  db.agreement.rows.push(
    base(id, {
      status: 'SIGNED',
      signedAt: new Date(),
      signedPdfKey: keys.signed,
      signedPdfSha256: hashes.signed,
      videoKey: keys.video,
      videoSha256: hashes.video,
      videoMimeType: 'video/webm;codecs=vp9,opus',
      videoDurationSec: 8.2,
    }),
  );
  bucket.set(keys.original, files.original);
  bucket.set(keys.signed, files.signed);
  bucket.set(keys.video, files.video);
  await appendAuditEvent(id, 'CREATED', {}, { originalPdfSha256: hashes.original });
  await appendAuditEvent(id, 'OPENED', { ip: '49.36.1.1', userAgent: 'Phone' });
  await appendAuditEvent(id, 'VIDEO_RECORDED', {}, { videoSha256: hashes.video });
  await appendAuditEvent(
    id,
    'SIGNED',
    {},
    { signedPdfSha256: hashes.signed, videoSha256: hashes.video },
  );
  return { keys };
}

beforeEach(() => {
  for (const t of [db.agreement, db.auditEvent, db.accessLog, db.user]) t.rows.length = 0;
  bucket.clear();
  sent.length = 0;
  db.user.rows.push({
    id: 'u1',
    name: 'Priya Staff',
    email: 'priya@example.com',
    role: 'STAFF',
    active: true,
  });
});

describe('staff agreement detail', () => {
  it('needs a staff session, and CSRF for writes', async () => {
    await seedSigned();
    await request(app).get('/api/v1/agreements/signed-1').expect(401);
    await request(app)
      .post('/api/v1/agreements/signed-1/verify-integrity')
      .set('Cookie', auth.Cookie)
      .expect(403);
    await request(app).get('/api/v1/agreements/nope').set(auth).expect(404);
  });

  it('returns details and the ordered timeline without the token hash', async () => {
    await seedSigned();
    const res = await request(app).get('/api/v1/agreements/signed-1').set(auth).expect(200);
    expect(res.body).toMatchObject({
      id: 'signed-1',
      status: 'SIGNED',
      hasVideo: true,
      createdBy: { name: 'Priya Staff' },
    });
    expect(res.body.events.map((e: { type: string }) => e.type)).toEqual([
      'CREATED',
      'OPENED',
      'VIDEO_RECORDED',
      'SIGNED',
    ]);
    expect(JSON.stringify(res.body)).not.toContain(row('signed-1').signingTokenHash as string);
  });

  it('rejects bad list filters', async () => {
    await request(app).get('/api/v1/agreements?from=07-11-2026').set(auth).expect(400);
    await request(app).get('/api/v1/agreements?packageType=CRUISE').set(auth).expect(400);
  });
});

describe('file access', () => {
  it('gives a 5-minute video URL and logs the view', async () => {
    await seedSigned();
    const res = await request(app)
      .get('/api/v1/agreements/signed-1/video-url')
      .set(auth)
      .expect(200);
    const url = new URL(res.body.url);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.pathname).toContain('video-x.webm');
    expect(url.searchParams.get('response-content-type')).toBe('video/webm');
    expect(access()).toEqual(['u1:VIDEO_VIEWED:signed-1']);
  });

  it('404s with no log when there is no video', async () => {
    db.agreement.rows.push(base('a2'));
    await request(app).get('/api/v1/agreements/a2/video-url').set(auth).expect(404);
    expect(access()).toEqual([]);
  });

  it('gives PDF view and download URLs, logging each', async () => {
    await seedSigned();
    const dl = await request(app)
      .get('/api/v1/agreements/signed-1/pdf-url?which=signed&download=1')
      .set(auth)
      .expect(200);
    expect(new URL(dl.body.url).searchParams.get('response-content-disposition')).toBe(
      'attachment; filename="agreement-signed-1-signed.pdf"',
    );
    await request(app)
      .get('/api/v1/agreements/signed-1/pdf-url?which=original')
      .set(auth)
      .expect(200);
    expect(access()).toEqual(['u1:PDF_DOWNLOADED:signed-1', 'u1:PDF_VIEWED:signed-1']);
  });

  it('streams an evidence bundle with all files, the audit log and hashes, and logs it', async () => {
    await seedSigned();
    const res = await asBuffer(
      request(app).get('/api/v1/agreements/signed-1/evidence-bundle').set(auth),
    ).expect(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="agreement-signed-1-evidence.zip"',
    );
    const zip = binary(res);
    expect(zip.subarray(0, 4).toString('latin1')).toBe('PK\x03\x04');
    const text = zip.toString('latin1');
    for (const b of Object.values(files)) expect(zip.includes(b)).toBe(true);
    expect(text).toContain(
      `${sha256Hex(files.original)}  original.pdf\n${sha256Hex(files.signed)}  signed.pdf\n${sha256Hex(files.video)}  video.webm\n`,
    );
    expect(text).toContain('"chainVerification": {\n    "ok": true');
    expect(text).toContain('"exportedBy": {\n    "id": "u1",\n    "name": "Priya Staff"');
    expect(text).toContain('README.txt');
    expect(access()).toEqual(['u1:BUNDLE_DOWNLOADED:signed-1']);
  });
});

describe('verify integrity', () => {
  const check = async () =>
    (await request(app).post('/api/v1/agreements/signed-1/verify-integrity').set(auth).expect(200))
      .body;
  const failed = (body: { checks: { name: string; ok: boolean }[] }) =>
    body.checks.filter((c) => !c.ok).map((c) => c.name);

  it('passes for untouched evidence and logs the check', async () => {
    await seedSigned();
    const body = await check();
    expect(body.ok).toBe(true);
    expect(body.checks.map((c: { name: string }) => c.name)).toEqual([
      'Original PDF',
      'Signed PDF',
      'Confirmation video',
      'Audit trail',
      'Recorded hashes',
    ]);
    expect(access()).toEqual(['u1:INTEGRITY_CHECKED:signed-1']);
  });

  it('fails when a stored file is changed or deleted', async () => {
    const { keys } = await seedSigned();
    bucket.set(keys.signed, Buffer.from('%PDF-edited'));
    bucket.delete(keys.video);
    const body = await check();
    expect(body.ok).toBe(false);
    expect(failed(body)).toEqual(['Signed PDF', 'Confirmation video']);
  });

  it('fails when an audit event is edited (e.g. trigger disabled by a DB admin)', async () => {
    await seedSigned();
    db.auditEvent.rows[1]!.ip = '10.0.0.1';
    const body = await check();
    expect(failed(body)).toEqual(['Audit trail']);
    expect(body.checks[3].detail).toContain('event #2');
  });

  it('fails when a file and its recorded hash are both swapped', async () => {
    const { keys } = await seedSigned();
    const forged = Buffer.from('%PDF-forged');
    bucket.set(keys.signed, forged);
    row('signed-1').signedPdfSha256 = sha256Hex(forged);
    const body = await check();
    expect(failed(body)).toEqual(['Recorded hashes']);
  });
});

describe('staff actions', () => {
  it('cancels an open agreement with a reason, once; signed ones cannot be cancelled', async () => {
    db.agreement.rows.push(base('a2'));
    await seedSigned();
    const res = await request(app)
      .post('/api/v1/agreements/a2/cancel')
      .set(auth)
      .send({ reason: 'Customer withdrew' })
      .expect(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(db.auditEvent.rows.at(-1)).toMatchObject({
      type: 'CANCELLED',
      metadata: { byUserId: 'u1', reason: 'Customer withdrew' },
    });
    await request(app).post('/api/v1/agreements/a2/cancel').set(auth).send({}).expect(409);
    await request(app).post('/api/v1/agreements/signed-1/cancel').set(auth).send({}).expect(409);
  });

  it('extends an expired link and restores its previous status', async () => {
    db.agreement.rows.push(
      base('a2', { status: 'EXPIRED', tokenExpiresAt: new Date(Date.now() - 1000) }),
    );
    await appendAuditEvent('a2', 'OPENED', {});
    await appendAuditEvent('a2', 'OTP_VERIFIED', {});
    const res = await request(app)
      .post('/api/v1/agreements/a2/extend')
      .set(auth)
      .send({ hours: 48 })
      .expect(200);
    expect(res.body.status).toBe('VERIFIED');
    const exp = new Date(res.body.tokenExpiresAt).getTime() - Date.now();
    expect(exp).toBeGreaterThan(47.9 * 3_600_000);
    expect(exp).toBeLessThanOrEqual(48 * 3_600_000);
    expect(types('a2').at(-1)).toBe('EXPIRY_EXTENDED');
    await request(app)
      .post('/api/v1/agreements/a2/extend')
      .set(auth)
      .send({ hours: 0 })
      .expect(400);
  });

  it('resends a fresh link: old link dies, new token is sent and stored hashed', async () => {
    db.agreement.rows.push(base('a2'));
    const oldHash = row('a2').signingTokenHash;
    const res = await request(app).post('/api/v1/agreements/a2/resend').set(auth).expect(200);
    expect(res.body.sent).toBe(true);
    expect(sent.at(-1)!.to).toBe('asha@example.com');
    const newToken = sent.at(-1)!.text.match(/\/sign\/([\w-]+)/)![1]!;
    expect(row('a2').signingTokenHash).toBe(sha256Hex(newToken));
    expect(row('a2').signingTokenHash).not.toBe(oldHash);
    expect(types('a2')).toEqual(['RESENT', 'MESSAGE_SENT']);
    await request(app).get(`/api/v1/sign/${newToken}`).expect(200);
  });
});
