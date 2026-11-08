import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { escapeHtml, renderPdf } from './pdf.service.js';

export interface SignatureDetails {
  agreementId: string;
  businessName: string;
  customerName: string;
  typedName: string;
  /** How the one-time code was delivered, e.g. "SMS code to +919876543210". */
  verifiedBy: string;
  otpVerifiedAt: Date;
  signedAt: Date;
  ip: string;
  userAgent: string;
  deviceInfo: string;
  originalPdfSha256: string;
  video: { sha256: string; durationSec: number; mimeType: string };
  auditChainHead: string;
  legalTextVersion: string;
  agreementConsentText: string;
}

export const formatIst = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'medium',
    hourCycle: 'h23',
  }).format(d) + ' IST';

export const formatUtc = (d: Date) =>
  d
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' UTC');

function signaturePageHtml(d: SignatureDetails, signaturePng: Uint8Array) {
  const rows: [string, string][] = [
    ['Agreement ID', d.agreementId],
    ['Signed by (typed name)', d.typedName],
    ['Customer name on record', d.customerName],
    ['Verified with one-time code', `${d.verifiedBy}, at ${formatIst(d.otpVerifiedAt)}`],
    ['Signed at (IST)', formatIst(d.signedAt)],
    ['Signed at (UTC)', formatUtc(d.signedAt)],
    ['IP address', d.ip],
    ['Browser', d.userAgent],
    ['Device', d.deviceInfo],
    ['Consent wording version', d.legalTextVersion],
    ['SHA-256 of unsigned agreement', d.originalPdfSha256],
    [
      'Confirmation video',
      `${d.video.durationSec.toFixed(1)} s, ${d.video.mimeType.split(';')[0]}, SHA-256 ${d.video.sha256}`,
    ],
    ['Audit trail hash before signing', d.auditChainHead],
  ];
  const img = `data:image/png;base64,${Buffer.from(signaturePng).toString('base64')}`;
  return `
    <h1>Electronic signature and verification</h1>
    <p>${escapeHtml(d.businessName)} · Agreement ${escapeHtml(d.agreementId)}</p>
    <p style="margin-top:14pt"><strong>Signer's confirmation:</strong> “${escapeHtml(d.agreementConsentText)}”</p>
    <div style="margin:14pt 0;padding:8pt;border:1px solid #999;border-radius:4pt;display:inline-block">
      <img src="${img}" alt="Signature" style="height:90pt;max-width:300pt;display:block" />
      <div style="border-top:1px solid #333;margin-top:4pt;padding-top:2pt;font-size:10pt">${escapeHtml(d.typedName)}</div>
    </div>
    <table style="border-collapse:collapse;width:100%;font-size:9pt">
      ${rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:4pt;border:1px solid #ccc;width:32%;color:#444">${escapeHtml(k)}</td>` +
            `<td style="padding:4pt;border:1px solid #ccc;word-break:break-all">${escapeHtml(v)}</td></tr>`,
        )
        .join('')}
    </table>
    <p style="margin-top:12pt;font-size:9pt;color:#444">
      This page was added automatically when the agreement was signed. The full audit trail and the
      customer's confirmation video are kept by ${escapeHtml(d.businessName)} as evidence.
    </p>`;
}

/**
 * Original pages + a verification page. Each original page gets a one-line ASCII footer stamp
 * (Helvetica can't draw non-Latin text; names go on the Chrome-rendered page, which can).
 */
export async function buildSignedPdf(
  original: Uint8Array,
  signaturePng: Uint8Array,
  d: SignatureDetails,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original);
  const pageCount = doc.getPageCount();
  const sigPdf = await PDFDocument.load(
    await renderPdf(
      signaturePageHtml(d, signaturePng),
      `${d.businessName} · Agreement ${d.agreementId} · Verification`,
      false, // no page numbers: this page is appended after the original pages
    ),
  );
  for (const p of await doc.copyPages(sigPdf, sigPdf.getPageIndices())) doc.addPage(p);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const stamp = `Electronically signed ${formatUtc(d.signedAt)} | Agreement ${d.agreementId} | Verification on page ${pageCount + 1}`;
  for (const page of doc.getPages().slice(0, pageCount)) {
    // Between the body (22mm bottom margin) and Chrome's footer line.
    page.drawText(stamp, { x: 51, y: 40, size: 7, font, color: rgb(0.1, 0.3, 0.6) });
  }
  doc.setModificationDate(d.signedAt);
  return doc.save();
}

/** Throws unless the bytes start with the PNG signature. */
export function assertPng(bytes: Uint8Array) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 8 || sig.some((b, i) => bytes[i] !== b)) throw new Error('not a PNG');
}
