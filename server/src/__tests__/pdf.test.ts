import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { fillTemplate } from '../services/pdf.service.js';
import { buildSignedPdf } from '../services/signed-pdf.service.js';

// 1×1 PNG, like a (very small) drawn signature.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const details = {
  agreementId: '3f2c9a1e-0000-4000-8000-000000000000',
  businessName: 'Zoltan Visa',
  customerName: 'Asha Rao',
  typedName: 'आशा राव (Asha Rao)', // Devanagari: printed as "?" by Helvetica, kept exactly in the audit event
  verifiedBy: 'SMS code to +919876543210',
  otpVerifiedAt: new Date('2026-11-07T13:57:00Z'),
  signedAt: new Date('2026-11-07T14:00:00Z'),
  ip: '49.36.12.7',
  userAgent:
    'Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
  deviceInfo: '{"screen":"393x873","timezone":"Asia/Kolkata"}',
  originalPdfSha256: 'a'.repeat(64),
  video: { sha256: 'c'.repeat(64), durationSec: 8.4, mimeType: 'video/webm;codecs=vp9,opus' },
  auditChainHead: 'b'.repeat(64),
  legalTextVersion: '2026-11-09',
  agreementConsentText: 'I have read and understood the agreement above, and I agree to its terms.',
  declarations: Array.from({ length: 10 }, (_, i) => `Declaration ${i + 1}: ${'word '.repeat(25)}`),
};

describe('pdf.service', () => {
  it('fillTemplate escapes values and leaves unknown placeholders visible', () => {
    expect(
      fillTemplate('<p>{{ name }} {{missing}}</p>', { name: '<script>x</script> & "y"' }),
    ).toBe('<p>&lt;script&gt;x&lt;/script&gt; &amp; &quot;y&quot; {{missing}}</p>');
  });
});

describe('buildSignedPdf (pdf-lib only, no browser)', () => {
  it('keeps the original pages and appends verification page(s), even with non-Latin text', async () => {
    const original = await PDFDocument.create();
    original.addPage([595.28, 841.89]);
    original.addPage([595.28, 841.89]);
    // updateMetadata: false, or loading would itself overwrite the dates being checked.
    const signed = await PDFDocument.load(
      await buildSignedPdf(await original.save(), PNG, details),
      { updateMetadata: false },
    );
    expect(signed.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(signed.getModificationDate()?.toISOString()).toBe('2026-11-07T14:00:00.000Z');
  });

  it('flows onto more pages when the details are long, instead of running off the page', async () => {
    const original = await PDFDocument.create();
    original.addPage([595.28, 841.89]);
    const long = { ...details, declarations: [...details.declarations, ...details.declarations] };
    const signed = await PDFDocument.load(await buildSignedPdf(await original.save(), PNG, long));
    expect(signed.getPageCount()).toBeGreaterThanOrEqual(3);
  });
});
