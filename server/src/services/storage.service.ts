import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env.js';

export const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: !!env.S3_ENDPOINT, // MinIO / R2 style
  // SDK v3.729+ adds CRC32 checksums by default; R2 and MinIO reject them on presigned uploads.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
});

const sse = env.S3_SSE === 'none' ? {} : { ServerSideEncryption: env.S3_SSE };

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ...sse,
    }),
  );
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  return res.Body!.transformToByteArray();
}

/** Short-lived GET URL. Never log the result. Pass downloadName to force a download. */
export function presignGet(
  key: string,
  expiresInSec: number,
  contentType?: string,
  downloadName?: string,
) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ResponseContentType: contentType,
      ResponseContentDisposition: downloadName
        ? `attachment; filename="${downloadName}"`
        : undefined,
    }),
    { expiresIn: expiresInSec },
  );
}

export async function getObjectStream(key: string): Promise<Readable> {
  const res = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  return res.Body as Readable;
}

/**
 * Short-lived PUT URL for a browser upload. Content-Type and Content-Length are signed, so the
 * upload must match them exactly. Encryption comes from the bucket's default (see README).
 */
export function presignPut(
  key: string,
  contentType: string,
  sizeBytes: number,
  expiresInSec: number,
) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    }),
    { expiresIn: expiresInSec, signableHeaders: new Set(['content-type', 'content-length']) },
  );
}

export async function headObject(key: string) {
  try {
    const h = await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return {
      sizeBytes: h.ContentLength ?? 0,
      contentType: h.ContentType,
      encryption: h.ServerSideEncryption,
    };
  } catch (e) {
    if ((e as { name?: string }).name === 'NotFound') return null;
    throw e;
  }
}

/** Streams the object through SHA-256 without holding it in memory. */
export async function sha256OfObject(key: string): Promise<string> {
  const res = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  const hash = createHash('sha256');
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) hash.update(chunk);
  return hash.digest('hex');
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}

/** shortcut: first 1000 keys only; enough for date-named backups, paginate if used for more. */
export async function listObjects(prefix: string) {
  const res = await s3.send(new ListObjectsV2Command({ Bucket: env.S3_BUCKET, Prefix: prefix }));
  return (res.Contents ?? []).map((o) => ({ key: o.Key!, lastModified: o.LastModified! }));
}

export const keys = {
  originalPdf: (agreementId: string) => `agreements/${agreementId}/original.pdf`,
  // Unique per attempt so a racing duplicate submit can't overwrite the PDF whose hash was recorded.
  signedPdf: (agreementId: string, nonce: string) =>
    `agreements/${agreementId}/signed-${nonce}.pdf`,
  video: (agreementId: string, nonce: string, ext: 'webm' | 'mp4') =>
    `agreements/${agreementId}/video-${nonce}.${ext}`,
};
