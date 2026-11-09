import type { Agreement } from '@prisma/client';
import type { Response } from 'express';
import yazl from 'yazl';
import { LEGAL_TEXT_VERSION, type FileUrl } from '../shared/index.js';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { HttpError } from '../errors.js';
import { logger } from '../logger.js';
import { verifyChain } from './audit.service.js';
import { getObjectStream, presignGet } from './storage.service.js';

const URL_TTL_SEC = 5 * 60;
const videoExt = (mime: string | null) => (mime?.startsWith('video/mp4') ? 'mp4' : 'webm');
const baseMime = (mime: string | null) => mime?.split(';')[0] ?? 'application/octet-stream';
const fileUrl = async (url: Promise<string>): Promise<FileUrl> => ({
  url: await url,
  expiresAt: new Date(Date.now() + URL_TTL_SEC * 1000).toISOString(),
});

export function videoUrl(a: Agreement) {
  if (!a.videoKey) throw new HttpError(404, 'No video recorded yet', 'NOT_FOUND');
  return fileUrl(presignGet(a.videoKey, URL_TTL_SEC, baseMime(a.videoMimeType)));
}

export function pdfUrl(a: Agreement, which: 'original' | 'signed', download: boolean) {
  const key = which === 'signed' ? a.signedPdfKey : a.originalPdfKey;
  if (!key) throw new HttpError(404, which === 'signed' ? 'Not signed yet' : 'No PDF', 'NOT_FOUND');
  const name = download ? `agreement-${a.id}-${which}.pdf` : undefined;
  return fileUrl(presignGet(key, URL_TTL_SEC, 'application/pdf', name));
}

const BUNDLE_README = `EVIDENCE BUNDLE

original.pdf    The agreement as sent to the customer, before signing.
signed.pdf      The signed agreement, with a verification page at the end.
video.*         The customer's confirmation video.
audit-log.json  Every recorded event (opened, OTP, viewed, consent, video, signed, ...).
hashes.txt      SHA-256 of each file, as recorded when it was stored.

To check the files have not been changed since they were stored:
    sha256sum -c hashes.txt          (Linux)
    shasum -a 256 -c hashes.txt      (macOS)

Audit events are hash-chained: each event's "hash" is
SHA-256(previous event's hash + canonical JSON of the event), starting from 64 zeros.
Canonical JSON = the fields agreementId, seq, type, ip, userAgent, deviceInfo, metadata,
createdAt (ISO 8601) with object keys sorted. Changing, removing or reordering any event
breaks every hash after it. "chainVerification" in audit-log.json shows the result at export.
`;

/** Streams a ZIP of all evidence for one agreement straight to the response. */
export async function streamEvidenceBundle(
  a: Agreement,
  exportedBy: { id: string; name: string },
  res: Response,
) {
  if (a.purgedAt) throw new HttpError(410, 'This agreement was purged.', 'PURGED');
  const events = await prisma.auditEvent.findMany({
    where: { agreementId: a.id },
    orderBy: { seq: 'asc' },
  });
  const files: { name: string; key: string | null; sha256: string | null }[] = [
    { name: 'original.pdf', key: a.originalPdfKey, sha256: a.originalPdfSha256 },
    { name: 'signed.pdf', key: a.signedPdfKey, sha256: a.signedPdfSha256 },
    { name: `video.${videoExt(a.videoMimeType)}`, key: a.videoKey, sha256: a.videoSha256 },
  ].filter((f) => f.key);

  // Open every object first so a missing file fails the request before any bytes are sent.
  const streams = await Promise.all(files.map((f) => getObjectStream(f.key!)));

  const zip = new yazl.ZipFile();
  // Stored, not deflated: PDFs and video barely compress, and plain entries are easy to inspect.
  const opts = { compress: false };
  files.forEach((f, i) => zip.addReadStream(streams[i]!, f.name, opts));
  const auditLog = {
    exportedAt: new Date().toISOString(),
    exportedBy,
    businessName: env.BUSINESS_NAME,
    agreement: {
      id: a.id,
      customerName: a.customerName,
      customerPhone: a.customerPhone,
      customerEmail: a.customerEmail,
      packageType: a.packageType,
      destination: a.destination,
      price: a.price.toFixed(2),
      currency: a.currency,
      templateId: a.templateId,
      templateVersion: a.templateVersion,
      consentTextVersion: a.consentTextVersion,
      currentLegalTextVersion: LEGAL_TEXT_VERSION,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      signedAt: a.signedAt?.toISOString() ?? null,
      originalPdfSha256: a.originalPdfSha256,
      signedPdfSha256: a.signedPdfSha256,
      videoSha256: a.videoSha256,
      videoMimeType: a.videoMimeType,
      videoDurationSec: a.videoDurationSec,
    },
    chainVerification: verifyChain(events),
    events: events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
  };
  zip.addBuffer(Buffer.from(JSON.stringify(auditLog, null, 2)), 'audit-log.json', opts);
  zip.addBuffer(
    Buffer.from(files.map((f) => `${f.sha256}  ${f.name}\n`).join('')),
    'hashes.txt',
    opts,
  );
  zip.addBuffer(Buffer.from(BUNDLE_README), 'README.txt', opts);
  zip.end();

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="agreement-${a.id}-evidence.zip"`);
  res.setHeader('Cache-Control', 'no-store');
  for (const s of streams) {
    s.on('error', (err) => {
      logger.error({ err, agreementId: a.id }, 'evidence bundle stream failed');
      res.destroy(err); // the client sees a failed download rather than a silently truncated ZIP
    });
  }
  zip.outputStream.pipe(res);
}
