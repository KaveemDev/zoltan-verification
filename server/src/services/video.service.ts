import { randomUUID } from 'node:crypto';
import type { Agreement } from '@prisma/client';
import jwt from 'jsonwebtoken';
import type { VideoPresign, VideoPresignResult } from '../shared/index.js';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { HttpError } from '../errors.js';
import { logger } from '../logger.js';
import { appendAuditEvent, type RequestContext } from './audit.service.js';
import { signError, stepsDone } from './signing.service.js';
import { deleteObject, headObject, keys, presignPut, sha256OfObject } from './storage.service.js';

const PUT_URL_TTL_SEC = 10 * 60;
const TICKET_TTL_SEC = 15 * 60;

interface UploadTicket extends VideoPresign {
  sub: string;
  typ: 'video-upload';
  key: string;
  contentType: 'video/webm' | 'video/mp4';
}

/** Issues a presigned PUT locked to the declared type and size, plus a signed ticket describing it. */
export async function presignVideo(a: Agreement, input: VideoPresign): Promise<VideoPresignResult> {
  if (!(await stepsDone(a)).recordingConsented) {
    throw signError(400, 'STEP_MISSING', 'Please agree to the recording first.');
  }
  const contentType = input.mimeType
    .split(';')[0]!
    .trim()
    .toLowerCase() as UploadTicket['contentType'];
  const key = keys.video(a.id, randomUUID(), contentType === 'video/mp4' ? 'mp4' : 'webm');
  const ticket: UploadTicket = { ...input, sub: a.id, typ: 'video-upload', key, contentType };
  return {
    uploadUrl: await presignPut(key, contentType, input.sizeBytes, PUT_URL_TTL_SEC),
    headers: { 'Content-Type': contentType },
    uploadId: jwt.sign(ticket, env.SIGNING_SESSION_SECRET, {
      algorithm: 'HS256',
      expiresIn: TICKET_TTL_SEC,
    }),
    expiresAt: new Date(Date.now() + PUT_URL_TTL_SEC * 1000).toISOString(),
  };
}

function readTicket(a: Agreement, uploadId: string): UploadTicket {
  try {
    const t = jwt.verify(uploadId, env.SIGNING_SESSION_SECRET, {
      algorithms: ['HS256'],
    }) as UploadTicket;
    if (t.typ === 'video-upload' && t.sub === a.id) return t;
  } catch {
    /* fall through */
  }
  throw signError(400, 'VIDEO_MISMATCH', 'This upload has expired. Please record the video again.');
}

/** Checks the uploaded object (exists, size, encryption, SHA-256) and attaches it to the agreement. */
export async function confirmVideo(a: Agreement, uploadId: string, ctx: RequestContext) {
  const t = readTicket(a, uploadId);
  if (a.videoKey === t.key) return; // already confirmed (client retry)

  const reject = async (why: string) => {
    logger.warn({ agreementId: a.id, why }, 'video upload rejected');
    await deleteObject(t.key).catch(() => undefined);
    throw signError(400, 'VIDEO_MISMATCH', 'The video did not upload correctly. Please try again.');
  };

  const head = await headObject(t.key);
  if (!head)
    throw signError(
      400,
      'VIDEO_MISMATCH',
      'We did not receive the video yet. Please try uploading again.',
    );
  if (head.sizeBytes !== t.sizeBytes) return reject('size mismatch');
  if (env.S3_SSE !== 'none' && !head.encryption) {
    logger.error(
      { agreementId: a.id },
      'uploaded video is not encrypted: enable default encryption on the bucket',
    );
    await deleteObject(t.key).catch(() => undefined);
    throw new HttpError(
      500,
      'We could not store your video securely. Please contact us.',
      'STORAGE_CONFIG',
    );
  }
  if ((await sha256OfObject(t.key)) !== t.sha256) return reject('sha256 mismatch');

  const previousKey = a.videoKey;
  await prisma.$transaction(async (tx) => {
    await tx.agreement.update({
      where: { id: a.id },
      data: {
        videoKey: t.key,
        videoSha256: t.sha256,
        videoMimeType: t.mimeType,
        videoDurationSec: t.durationSec,
      },
    });
    await appendAuditEvent(
      a.id,
      'VIDEO_RECORDED',
      ctx,
      {
        videoSha256: t.sha256,
        mimeType: t.mimeType,
        sizeBytes: t.sizeBytes,
        durationSec: t.durationSec,
        replacesPrevious: !!previousKey,
      },
      tx,
    );
  });
  // Data minimisation: a re-recorded video replaces the old one.
  if (previousKey)
    await deleteObject(previousKey).catch((err) => logger.warn({ err }, 'old video delete failed'));
}
