import { PDFDocument, StandardFonts, rgb, type PDFFont, type RGB } from 'pdf-lib';

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
  /** Client Declaration statements, all ticked by the customer before signing. */
  declarations: string[];
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

const A4: [number, number] = [595.28, 841.89];
const MARGIN = { x: 51, top: 57, bottom: 60 };
const GREY = rgb(0.33, 0.33, 0.33);
const BLUE = rgb(0.1, 0.3, 0.6);

/**
 * The verification page(s), drawn with pdf-lib's built-in Helvetica (no browser needed). Helvetica
 * only covers Latin text, so other characters (e.g. a name typed in Devanagari) print as "?"; the
 * exact text is always kept in the SIGNED audit event.
 */
async function addVerificationPages(
  doc: PDFDocument,
  d: SignatureDetails,
  signaturePng: Uint8Array,
) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(font.getCharacterSet());
  const latin = (t: string) =>
    [...t].map((c) => (supported.has(c.codePointAt(0)!) ? c : '?')).join('');
  const width = A4[0] - 2 * MARGIN.x;

  /** Word-wraps text to a width; words longer than a line (hashes, browser strings) are split. */
  const wrap = (text: string, f: PDFFont, size: number, max: number) => {
    const lines: string[] = [];
    let line = '';
    for (const word of latin(text).split(/\s+/)) {
      let w = word;
      while (f.widthOfTextAtSize(w, size) > max) {
        let n = w.length;
        while (n > 1 && f.widthOfTextAtSize(w.slice(0, n), size) > max) n--;
        if (line) {
          lines.push(line);
          line = '';
        }
        lines.push(w.slice(0, n));
        w = w.slice(n);
      }
      const next = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(next, size) <= max) line = next;
      else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  let page = doc.addPage(A4);
  let y = A4[1] - MARGIN.top;
  const footer = () =>
    page.drawText(latin(`${d.businessName} · Agreement ${d.agreementId} · Verification`), {
      x: MARGIN.x,
      y: 30,
      size: 7.5,
      font,
      color: GREY,
    });
  footer();
  /** Starts a new page when the next block doesn't fit. */
  const room = (h: number) => {
    if (y - h >= MARGIN.bottom) return;
    page = doc.addPage(A4);
    y = A4[1] - MARGIN.top;
    footer();
  };
  const para = (
    text: string,
    o: { f?: PDFFont; size?: number; indent?: number; gap?: number; color?: RGB } = {},
  ) => {
    const { f = font, size = 10, indent = 0, gap = 6, color = rgb(0, 0, 0) } = o;
    for (const l of wrap(text, f, size, width - indent)) {
      room(size * 1.35);
      page.drawText(l, { x: MARGIN.x + indent, y: y - size, size, font: f, color });
      y -= size * 1.35;
    }
    y -= gap;
  };

  para('Electronic signature and verification', { f: bold, size: 17, gap: 4 });
  para(`${d.businessName} · Agreement ${d.agreementId}`, { size: 10, color: GREY, gap: 12 });
  para("Signer's confirmation:", { f: bold, gap: 1 });
  para(`"${d.agreementConsentText}"`, { gap: 10 });
  para('Client Declaration, each statement ticked by the signer:', { f: bold, gap: 3 });
  for (const t of d.declarations) para(`[x] ${t}`, { size: 9, indent: 8, gap: 2 });
  y -= 10;

  // Signature box: drawn signature, then the typed name under a line.
  const png = await doc.embedPng(signaturePng);
  const scale = Math.min(80 / png.height, 280 / png.width);
  const box = { w: 300, h: png.height * scale + 34 };
  room(box.h + 12);
  page.drawRectangle({
    x: MARGIN.x,
    y: y - box.h,
    width: box.w,
    height: box.h,
    borderColor: GREY,
    borderWidth: 0.7,
  });
  page.drawImage(png, {
    x: MARGIN.x + 10,
    y: y - 8 - png.height * scale,
    width: png.width * scale,
    height: png.height * scale,
  });
  page.drawLine({
    start: { x: MARGIN.x + 10, y: y - box.h + 22 },
    end: { x: MARGIN.x + box.w - 10, y: y - box.h + 22 },
    thickness: 0.7,
  });
  page.drawText(wrap(d.typedName, font, 10, box.w - 20)[0] ?? '', {
    x: MARGIN.x + 10,
    y: y - box.h + 9,
    size: 10,
    font,
  });
  y -= box.h + 14;

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
  const labelW = 150;
  const size = 8.5;
  const lh = size * 1.3;
  for (const [label, value] of rows) {
    const labelLines = wrap(label, font, size, labelW - 8);
    const valueLines = wrap(value, font, size, width - labelW - 8);
    const h = Math.max(labelLines.length, valueLines.length) * lh + 7;
    room(h);
    for (const [x, w] of [
      [MARGIN.x, labelW],
      [MARGIN.x + labelW, width - labelW],
    ] as const) {
      page.drawRectangle({
        x,
        y: y - h,
        width: w,
        height: h,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 0.6,
      });
    }
    labelLines.forEach((l, i) =>
      page.drawText(l, { x: MARGIN.x + 4, y: y - 4 - size - i * lh, size, font, color: GREY }),
    );
    valueLines.forEach((l, i) =>
      page.drawText(l, { x: MARGIN.x + labelW + 4, y: y - 4 - size - i * lh, size, font }),
    );
    y -= h;
  }
  y -= 12;
  para(
    `This page was added automatically when the agreement was signed. The full audit trail and the ` +
      `customer's confirmation video are kept by ${d.businessName} as evidence.`,
    { size: 8.5, color: GREY },
  );
}

/**
 * Original pages (built in the staff member's browser) + verification page(s), with a one-line
 * footer stamp on every original page. Everything here is pdf-lib: no browser on the server.
 */
export async function buildSignedPdf(
  original: Uint8Array,
  signaturePng: Uint8Array,
  d: SignatureDetails,
): Promise<Uint8Array> {
  // updateMetadata: false, or pdf-lib replaces the modification date set below with the save time.
  const doc = await PDFDocument.load(original, { updateMetadata: false });
  const pageCount = doc.getPageCount();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const stamp = `Electronically signed ${formatUtc(d.signedAt)} | Agreement ${d.agreementId} | Verification on page ${pageCount + 1}`;
  for (const page of doc.getPages()) {
    // Between the body and the page-number footer (frontend/src/lib/agreementPdf.ts sets both).
    page.drawText(stamp, { x: 51, y: 44, size: 7, font, color: BLUE });
  }
  await addVerificationPages(doc, d, signaturePng);
  doc.setModificationDate(d.signedAt);
  return doc.save();
}

/** Throws unless the bytes start with the PNG signature. */
export function assertPng(bytes: Uint8Array) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 8 || sig.some((b, i) => bytes[i] !== b)) throw new Error('not a PNG');
}
