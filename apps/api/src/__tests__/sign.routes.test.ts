import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGAL_TEXT_VERSION } from '@app/shared';
import { generateToken, sha256Hex } from '../lib/crypto.js';
import { createFakePrisma } from './fakePrisma.js';

const db = createFakePrisma();
vi.mock('../db.js', () => ({ prisma: db }));

const sent: { channel: 'sms' | 'email'; to: string; code: string }[] = [];
vi.mock('../messaging/index.js', () => ({
  getSms: () => ({
    name: 'test-sms',
    sendOtp: async (to: string, code: string) => {
      sent.push({ channel: 'sms', to, code });
      return { messageId: 'sms-1' };
    },
  }),
  getEmail: () => ({
    name: 'test-email',
    // The OTP email subject starts with the code.
    send: async (m: { to: { email: string }; subject: string }) => {
      sent.push({ channel: 'email', to: m.to.email, code: m.subject.slice(0, 6) });
      return { messageId: 'email-1' };
    },
  }),
}));

const onePagePdf = async (text: string) => {
  const d = await PDFDocument.create();
  d.addPage([595, 842]).drawText(text, { x: 50, y: 800 });
  return d.save();
};
const original = await onePagePdf('Agreement body');
const uploads = new Map<string, Uint8Array>();
// What the customer's browser PUT straight to storage.
const bucket = new Map<string, { body: Uint8Array; encrypted: boolean }>();
const deleteObject = vi.fn(async (key: string) => void bucket.delete(key));
vi.mock('../services/storage.service.js', async (orig) => ({
  ...(await orig<object>()),
  getObjectBytes: async () => original,
  putObject: async (key: string, body: Uint8Array) => void uploads.set(key, body),
  presignGet: async (key: string) => `https://s3.test/${key}?sig=x`,
  headObject: async (key: string) => {
    const o = bucket.get(key);
    return o && { sizeBytes: o.body.length, encryption: o.encrypted ? 'AES256' : undefined };
  },
  sha256OfObject: async (key: string) => sha256Hex(bucket.get(key)!.body),
  deleteObject,
}));
// Chrome is covered by pdf.test.ts; here a pdf-lib page stands in for the verification page.
vi.mock('../services/pdf.service.js', async (orig) => ({
  ...(await orig<object>()),
  renderPdf: () => onePagePdf('Verification page'),
}));

const { createApp } = await import('../app.js');
const { verifyChain } = await import('../services/audit.service.js');

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let app: ReturnType<typeof createApp>;
let token: string;
const id = 'agr-1';
const row = () => db.agreement.rows[0]!;
const events = () => db.auditEvent.rows.filter((e) => e.agreementId === id);
const types = () => events().map((e) => e.type);
const lastCode = () => sent.at(-1)!.code;
const base = () => `/api/v1/sign/${token}`;
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  app = createApp();
  db.agreement.rows.length = db.otpChallenge.rows.length = db.auditEvent.rows.length = 0;
  sent.length = 0;
  uploads.clear();
  bucket.clear();
  deleteObject.mockClear();
  const t = generateToken();
  token = t.token;
  db.agreement.rows.push({
    id,
    customerName: 'Asha Rao',
    customerPhone: '+919876543210',
    customerEmail: 'asha@example.com',
    packageType: 'VISA',
    destination: 'Canada',
    price: { toFixed: () => '25000.00' },
    currency: 'INR',
    status: 'SENT',
    signingTokenHash: t.hash,
    tokenExpiresAt: new Date(Date.now() + 72 * 3_600_000),
    originalPdfKey: `agreements/${id}/original.pdf`,
    originalPdfSha256: sha256Hex(original),
    signedAt: null,
  });
});
afterEach(() => vi.useRealTimers());

const VIDEO = new Uint8Array(50_000).fill(7);

async function readAndConsent(auth: Record<string, string>) {
  await request(app)
    .post(`${base()}/events`)
    .set(auth)
    .send({ type: 'AGREEMENT_VIEWED', pagesViewed: 1, totalPages: 1, secondsOnPage: 30 })
    .expect(204);
  await request(app)
    .post(`${base()}/events`)
    .set(auth)
    .send({ type: 'RECORDING_CONSENT_GIVEN', legalTextVersion: LEGAL_TEXT_VERSION })
    .expect(204);
}

/** presign → simulated browser PUT → confirm. Returns the confirm response and the object key. */
async function recordVideo(
  auth: Record<string, string>,
  opts: { uploaded?: Uint8Array | null; encrypted?: boolean; mimeType?: string } = {},
) {
  const p = await request(app)
    .post(`${base()}/video/presign`)
    .set(auth)
    .send({
      mimeType: opts.mimeType ?? 'video/webm;codecs=vp9,opus',
      sizeBytes: VIDEO.length,
      durationSec: 8.4,
      sha256: sha256Hex(VIDEO),
    })
    .expect(200);
  const key = decodeURIComponent(new URL(p.body.uploadUrl).pathname.slice(1));
  if (opts.uploaded !== null)
    bucket.set(key, { body: opts.uploaded ?? VIDEO, encrypted: opts.encrypted ?? true });
  const res = await request(app)
    .post(`${base()}/video/confirm`)
    .set(auth)
    .send({ uploadId: p.body.uploadId });
  return { res, key, presign: p.body };
}

async function verifyPhone() {
  await request(app).post(`${base()}/otp/send`).expect(200);
  const res = await request(app)
    .post(`${base()}/otp/verify`)
    .send({ code: lastCode() })
    .expect(200);
  return { Authorization: `Bearer ${res.body.sessionToken}` };
}

describe('link validation', () => {
  it('opens a valid link once: OPENED event and status, minimal info only', async () => {
    const res = await request(app)
      .get(base())
      .set('x-device-info', '{"screen":"390x844","timezone":"Asia/Kolkata"}')
      .expect(200);
    expect(res.body).toMatchObject({
      customerName: 'Asha Rao',
      codeChannel: 'sms',
      codeDestination: '••••3210',
      businessName: 'Test Travel',
    });
    expect(res.body).not.toHaveProperty('customerPhone');
    await request(app).get(base()).expect(200);
    expect(types()).toEqual(['OPENED']);
    expect(events()[0]!.deviceInfo).toEqual({ screen: '390x844', timezone: 'Asia/Kolkata' });
    expect(row().status).toBe('OPENED');
  });

  it('rejects malformed and unknown tokens', async () => {
    expect((await request(app).get('/api/v1/sign/short').expect(404)).body.error).toBe(
      'LINK_INVALID',
    );
    expect(
      (await request(app).get(`/api/v1/sign/${generateToken().token}`).expect(404)).body.error,
    ).toBe('LINK_INVALID');
  });

  it('rejects an expired link, marking it EXPIRED once', async () => {
    advance(73 * 3_600_000);
    expect((await request(app).get(base()).expect(410)).body.error).toBe('LINK_EXPIRED');
    await request(app).post(`${base()}/otp/send`).expect(410);
    expect(row().status).toBe('EXPIRED');
    expect(types()).toEqual(['EXPIRED']);
  });

  it('rejects cancelled and already-signed links', async () => {
    row().status = 'CANCELLED';
    expect((await request(app).get(base()).expect(410)).body.error).toBe('LINK_CANCELLED');
    row().status = 'SIGNED';
    expect((await request(app).get(base()).expect(409)).body.error).toBe('ALREADY_SIGNED');
  });
});

describe('OTP', () => {
  it('emails the code for numbers outside SMS_COUNTRY_CODES (+91), and records the channel', async () => {
    row().customerPhone = '+447700900123';
    const info = await request(app).get(base()).expect(200);
    expect(info.body).toMatchObject({ codeChannel: 'email', codeDestination: 'a•••@example.com' });
    await request(app).post(`${base()}/otp/send`).expect(200);
    expect(sent.at(-1)).toMatchObject({ channel: 'email', to: 'asha@example.com' });
    expect(lastCode()).toMatch(/^\d{6}$/);
    await request(app).post(`${base()}/otp/verify`).send({ code: lastCode() }).expect(200);
    expect(events().find((e) => e.type === 'OTP_VERIFIED')!.metadata).toMatchObject({
      channel: 'email',
      to: 'asha@example.com',
    });
  });

  it('sends a 6-digit code to the agreement phone, stored only as a keyed hash', async () => {
    await request(app).post(`${base()}/otp/send`).expect(200);
    const code = lastCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(sent.at(-1)).toMatchObject({ channel: 'sms', to: '+919876543210' });
    expect(events().at(-1)!.metadata).toMatchObject({
      channel: 'sms',
      to: '+919876543210',
      provider: 'test-sms',
    });
    const stored = db.otpChallenge.rows[0]!.codeHash as string;
    expect(stored).not.toContain(code);
    expect(stored).not.toBe(sha256Hex(code));
    expect(JSON.stringify(events())).not.toContain(code);
  });

  it('enforces the 60s resend cooldown and invalidates older codes', async () => {
    await request(app).post(`${base()}/otp/send`).expect(200);
    const first = lastCode();
    const res = await request(app).post(`${base()}/otp/send`).expect(429);
    expect(res.body).toMatchObject({
      error: 'OTP_COOLDOWN',
      resendAvailableAt: expect.any(String),
    });
    advance(61_000);
    await request(app).post(`${base()}/otp/send`).expect(200);
    if (first !== lastCode()) {
      await request(app).post(`${base()}/otp/verify`).send({ code: first }).expect(400);
    }
    await request(app).post(`${base()}/otp/verify`).send({ code: lastCode() }).expect(200);
  });

  it('locks after 5 wrong attempts, even for the right code', async () => {
    await request(app).post(`${base()}/otp/send`).expect(200);
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let left = 4; left >= 0; left--) {
      const r = await request(app).post(`${base()}/otp/verify`).send({ code: wrong }).expect(400);
      expect(r.body).toMatchObject({ error: 'OTP_INVALID', attemptsLeft: left });
    }
    expect(
      (await request(app).post(`${base()}/otp/verify`).send({ code }).expect(429)).body.error,
    ).toBe('OTP_LOCKED');
    expect(types().filter((t) => t === 'OTP_FAILED')).toHaveLength(5);
  });

  it('expires codes after 10 minutes', async () => {
    await request(app).post(`${base()}/otp/send`).expect(200);
    advance(10 * 60_000 + 1);
    expect(
      (await request(app).post(`${base()}/otp/verify`).send({ code: lastCode() }).expect(400)).body
        .error,
    ).toBe('OTP_EXPIRED');
  });

  it('marks VERIFIED and returns a session on the right code', async () => {
    await verifyPhone();
    expect(row().status).toBe('VERIFIED');
    expect(types()).toEqual(['OTP_SENT', 'OTP_VERIFIED']);
  });

  it('rate-limits code sends per link (5 per hour)', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post(`${base()}/otp/send`).expect(200);
      advance(61_000);
    }
    expect((await request(app).post(`${base()}/otp/send`).expect(429)).body.error).toBe(
      'RATE_LIMITED',
    );
  });

  it('validates the code format', async () => {
    await request(app).post(`${base()}/otp/verify`).send({ code: '12ab' }).expect(400);
  });
});

describe('signing session and completion', () => {
  it('requires a session bound to this link', async () => {
    expect((await request(app).get(`${base()}/document`).expect(401)).body.error).toBe(
      'SESSION_EXPIRED',
    );
    const auth = await verifyPhone();
    const doc = await request(app).get(`${base()}/document`).set(auth).expect(200);
    expect(doc.body).toMatchObject({
      price: '25000.00',
      progress: { viewed: false, recordingConsented: false },
    });

    // A resent link (new token hash) invalidates the old session.
    const t2 = generateToken();
    row().signingTokenHash = t2.hash;
    await request(app).get(`/api/v1/sign/${t2.token}/document`).set(auth).expect(401);
  });

  it('expires sessions after 30 minutes', async () => {
    const auth = await verifyPhone();
    advance(31 * 60_000);
    await request(app).get(`${base()}/document`).set(auth).expect(401);
  });

  it('enforces step order and legal text version', async () => {
    const auth = await verifyPhone();
    const sign = {
      typedName: 'Asha Rao',
      signaturePng: PNG,
      agreed: true,
      legalTextVersion: LEGAL_TEXT_VERSION,
    };
    expect(
      (await request(app).post(`${base()}/complete`).set(auth).send(sign).expect(400)).body.error,
    ).toBe('STEP_MISSING');
    await request(app)
      .post(`${base()}/events`)
      .set(auth)
      .send({ type: 'AGREEMENT_VIEWED', pagesViewed: 1, totalPages: 3, secondsOnPage: 5 })
      .expect(400);
    await request(app)
      .post(`${base()}/events`)
      .set(auth)
      .send({ type: 'RECORDING_CONSENT_GIVEN', legalTextVersion: 'old' })
      .expect(409);
    await request(app)
      .post(`${base()}/complete`)
      .set(auth)
      .send({ ...sign, agreed: false })
      .expect(400);
  });

  it('completes the full flow: signed PDF stored with hash, SIGNED, chain intact, link single-use', async () => {
    await request(app).get(base()).expect(200);
    const auth = await verifyPhone();
    await request(app)
      .post(`${base()}/events`)
      .set(auth)
      .send({ type: 'AGREEMENT_VIEWED', pagesViewed: 1, totalPages: 1, secondsOnPage: 42 })
      .expect(204);
    await request(app)
      .post(`${base()}/events`)
      .set(auth)
      .send({ type: 'RECORDING_CONSENT_GIVEN', legalTextVersion: LEGAL_TEXT_VERSION })
      .expect(204);
    expect(row().consentTextVersion).toBe(LEGAL_TEXT_VERSION);
    expect((await recordVideo(auth)).res.status).toBe(204);

    await request(app)
      .post(`${base()}/complete`)
      .set(auth)
      .send({
        typedName: 'Asha Rao',
        signaturePng: 'data:image/png;base64,AAAA',
        agreed: true,
        legalTextVersion: LEGAL_TEXT_VERSION,
      })
      .expect(400);

    const res = await request(app)
      .post(`${base()}/complete`)
      .set(auth)
      .set('user-agent', 'TestPhone/1.0')
      .send({
        typedName: 'Asha Rao',
        signaturePng: PNG,
        agreed: true,
        legalTextVersion: LEGAL_TEXT_VERSION,
      })
      .expect(200);
    expect(res.body.agreementId).toBe(id);

    const a = row();
    expect(a.status).toBe('SIGNED');
    expect(a.signedAt).toBeInstanceOf(Date);
    const signed = uploads.get(a.signedPdfKey as string)!;
    expect(a.signedPdfSha256).toBe(sha256Hex(signed));
    expect((await PDFDocument.load(signed)).getPageCount()).toBe(2);

    expect(types()).toEqual([
      'OPENED',
      'OTP_SENT',
      'OTP_VERIFIED',
      'AGREEMENT_VIEWED',
      'RECORDING_CONSENT_GIVEN',
      'VIDEO_RECORDED',
      'SIGNED',
    ]);
    expect(events().at(-1)!.userAgent).toBe('TestPhone/1.0');
    expect(verifyChain(events() as never)).toEqual({ ok: true });

    expect((await request(app).get(base()).expect(409)).body.error).toBe('ALREADY_SIGNED');
    await request(app).post(`${base()}/complete`).set(auth).send({}).expect(409);
  });

  it('refuses to sign if the stored original PDF no longer matches its hash', async () => {
    const auth = await verifyPhone();
    await request(app)
      .post(`${base()}/events`)
      .set(auth)
      .send({ type: 'AGREEMENT_VIEWED', pagesViewed: 1, totalPages: 1, secondsOnPage: 1 })
      .expect(204);
    await request(app)
      .post(`${base()}/events`)
      .set(auth)
      .send({ type: 'RECORDING_CONSENT_GIVEN', legalTextVersion: LEGAL_TEXT_VERSION })
      .expect(204);
    expect((await recordVideo(auth)).res.status).toBe(204);
    row().originalPdfSha256 = 'f'.repeat(64);
    const res = await request(app)
      .post(`${base()}/complete`)
      .set(auth)
      .send({
        typedName: 'Asha Rao',
        signaturePng: PNG,
        agreed: true,
        legalTextVersion: LEGAL_TEXT_VERSION,
      })
      .expect(500);
    expect(res.body.error).toBe('INTEGRITY');
    expect(row().status).not.toBe('SIGNED');
  });
});

describe('selfie video', () => {
  it('needs recording consent before an upload URL is issued', async () => {
    const auth = await verifyPhone();
    const body = {
      mimeType: 'video/mp4',
      sizeBytes: 50_000,
      durationSec: 8,
      sha256: 'a'.repeat(64),
    };
    expect(
      (await request(app).post(`${base()}/video/presign`).send(body).expect(401)).body.error,
    ).toBe('SESSION_EXPIRED');
    expect(
      (await request(app).post(`${base()}/video/presign`).set(auth).send(body).expect(400)).body
        .error,
    ).toBe('STEP_MISSING');
  });

  it('validates type, size and duration', async () => {
    const auth = await verifyPhone();
    await readAndConsent(auth);
    const ok = { mimeType: 'video/mp4', sizeBytes: 50_000, durationSec: 8, sha256: 'a'.repeat(64) };
    for (const bad of [
      { mimeType: 'video/avi' },
      { mimeType: 'text/html' },
      { sizeBytes: 61 * 1024 * 1024 },
      { sizeBytes: 100 },
      { durationSec: 2 },
      { durationSec: 30 },
      { sha256: 'xyz' },
    ]) {
      await request(app)
        .post(`${base()}/video/presign`)
        .set(auth)
        .send({ ...ok, ...bad })
        .expect(400);
    }
  });

  it('issues a 10-minute PUT URL locked to content type and length', async () => {
    const auth = await verifyPhone();
    await readAndConsent(auth);
    const { presign, key } = await recordVideo(auth, { uploaded: null });
    const url = new URL(presign.uploadUrl);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-SignedHeaders')!.split(';')).toEqual(
      expect.arrayContaining(['content-length', 'content-type', 'host']),
    );
    expect(presign.headers).toEqual({ 'Content-Type': 'video/webm' });
    expect(key).toMatch(new RegExp(`^agreements/${id}/video-[0-9a-f-]{36}\\.webm$`));
    const mp4 = await recordVideo(auth, { uploaded: null, mimeType: 'video/mp4' });
    expect(mp4.key.endsWith('.mp4')).toBe(true);
  });

  it('confirms a matching upload: stores hash, logs VIDEO_RECORDED, unlocks signing', async () => {
    const auth = await verifyPhone();
    await readAndConsent(auth);
    const { res, key } = await recordVideo(auth);
    expect(res.status).toBe(204);
    expect(row()).toMatchObject({
      videoKey: key,
      videoSha256: sha256Hex(VIDEO),
      videoMimeType: 'video/webm;codecs=vp9,opus',
      videoDurationSec: 8.4,
    });
    expect(events().at(-1)).toMatchObject({
      type: 'VIDEO_RECORDED',
      metadata: { videoSha256: sha256Hex(VIDEO), sizeBytes: VIDEO.length, replacesPrevious: false },
    });
    const doc = await request(app).get(`${base()}/document`).set(auth).expect(200);
    expect(doc.body.progress).toEqual({
      viewed: true,
      recordingConsented: true,
      videoRecorded: true,
    });
  });

  it('rejects missing, altered and unencrypted uploads', async () => {
    const auth = await verifyPhone();
    await readAndConsent(auth);

    const missing = await recordVideo(auth, { uploaded: null });
    expect(missing.res.status).toBe(400);
    expect(missing.res.body.error).toBe('VIDEO_MISMATCH');

    const altered = await recordVideo(auth, { uploaded: new Uint8Array(VIDEO.length).fill(9) });
    expect(altered.res.status).toBe(400);
    expect(deleteObject).toHaveBeenCalledWith(altered.key);

    const short = await recordVideo(auth, { uploaded: VIDEO.slice(1) });
    expect(short.res.status).toBe(400);

    const plain = await recordVideo(auth, { encrypted: false });
    expect(plain.res.status).toBe(500);
    expect(plain.res.body.error).toBe('STORAGE_CONFIG');
    expect(bucket.has(plain.key)).toBe(false);

    expect(row().videoKey).toBeUndefined();
    expect(types()).not.toContain('VIDEO_RECORDED');
  });

  it('rejects forged or expired upload tickets', async () => {
    const auth = await verifyPhone();
    await readAndConsent(auth);
    await request(app)
      .post(`${base()}/video/confirm`)
      .set(auth)
      .send({ uploadId: 'forged' })
      .expect(400);

    const { presign } = await recordVideo(auth, { uploaded: null });
    advance(16 * 60_000);
    const fresh = await verifyPhone();
    const res = await request(app)
      .post(`${base()}/video/confirm`)
      .set(fresh)
      .send({ uploadId: presign.uploadId });
    expect(res.status).toBe(400);
  });

  it('a re-recorded video replaces and deletes the previous one; signing requires a video', async () => {
    const auth = await verifyPhone();
    await readAndConsent(auth);
    const sign = {
      typedName: 'Asha Rao',
      signaturePng: PNG,
      agreed: true,
      legalTextVersion: LEGAL_TEXT_VERSION,
    };
    const missing = await request(app).post(`${base()}/complete`).set(auth).send(sign).expect(400);
    expect(missing.body).toMatchObject({ error: 'STEP_MISSING', videoRecorded: false });

    const first = await recordVideo(auth);
    const second = await recordVideo(auth);
    expect(row().videoKey).toBe(second.key);
    expect(deleteObject).toHaveBeenCalledWith(first.key);
    expect(events().at(-1)!.metadata).toMatchObject({ replacesPrevious: true });

    // Confirming the same upload twice (client retry) is a no-op.
    const before = events().length;
    await request(app)
      .post(`${base()}/video/confirm`)
      .set(auth)
      .send({ uploadId: second.presign.uploadId })
      .expect(204);
    expect(events()).toHaveLength(before);
  });
});
