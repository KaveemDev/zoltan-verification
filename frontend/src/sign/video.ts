import { DEMO } from '../demo';
/** Recorder formats in order of preference. iOS Safari only supports MP4. */
const MIME_CANDIDATES = ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];

export function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export type CameraProblem = 'denied' | 'busy' | 'unsupported';

export function classifyCameraError(e: unknown): CameraProblem {
  const name = (e as DOMException)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
  return 'unsupported'; // NotFoundError, OverconstrainedError, no API, insecure context
}

export function openCamera() {
  return navigator.mediaDevices.getUserMedia({
    // Modest resolution keeps 15 s uploads small on mobile data.
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: true,
  });
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** PUT with progress (fetch can't report upload progress). */
export function putWithProgress(
  url: string,
  blob: Blob,
  headers: Record<string, string>,
  onProgress: (fraction: number) => void,
): Promise<void> {
  if (DEMO) return Promise.resolve(onProgress(1)); // demo: nowhere to upload
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`));
    xhr.onerror = xhr.ontimeout = () => reject(new Error('network'));
    xhr.timeout = 120_000;
    xhr.send(blob);
  });
}
