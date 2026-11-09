import { VIDEO_LIMITS, type VideoPresign, type VideoPresignResult } from '../../shared/index';
import { useEffect, useRef, useState } from 'react';
import { copy, fill } from '../copy';
import {
  classifyCameraError,
  openCamera,
  pickMimeType,
  putWithProgress,
  sha256Hex,
  type CameraProblem,
} from '../video';
import { Card, ErrorText, PrimaryButton, SecondaryButton } from '../ui';

type Phase =
  | { k: 'intro' }
  | { k: 'starting' }
  | { k: 'problem'; problem: CameraProblem }
  | { k: 'ready' }
  | { k: 'countdown'; n: number }
  | { k: 'recording'; seconds: number }
  | { k: 'review'; blob: Blob; url: string; durationSec: number }
  | { k: 'uploading'; percent: number | null; blob: Blob; url: string; durationSec: number }
  | { k: 'failed'; blob: Blob; url: string; durationSec: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function VideoStep({
  script,
  business,
  presign,
  confirm,
  onDone,
}: {
  script: string;
  business: string;
  presign: (v: VideoPresign) => Promise<VideoPresignResult>;
  confirm: (uploadId: string) => Promise<void>;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ k: 'intro' });
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mimeType = useRef(pickMimeType());

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stopCamera, []);

  // Attach the live stream whenever the preview <video> is on screen.
  const live = phase.k === 'ready' || phase.k === 'countdown' || phase.k === 'recording';
  useEffect(() => {
    const v = videoRef.current;
    if (!live || !v || !streamRef.current) return;
    v.muted = true; // iOS only autoplays muted, inline video
    v.srcObject = streamRef.current;
    v.play().catch(() => undefined);
  }, [live]);

  // Free the recorded blob URL when it's replaced or the step unmounts.
  const blobUrl = 'url' in phase ? phase.url : null;
  useEffect(() => () => void (blobUrl && URL.revokeObjectURL(blobUrl)), [blobUrl]);

  async function enableCamera() {
    if (!mimeType.current) return setPhase({ k: 'problem', problem: 'unsupported' });
    setPhase({ k: 'starting' });
    try {
      streamRef.current ??= await openCamera();
      setPhase({ k: 'ready' });
    } catch (e) {
      setPhase({ k: 'problem', problem: classifyCameraError(e) });
    }
  }

  async function record() {
    for (const n of [3, 2, 1]) {
      setPhase({ k: 'countdown', n });
      await sleep(1000);
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(streamRef.current!, {
      mimeType: mimeType.current!,
      videoBitsPerSecond: 1_000_000,
      audioBitsPerSecond: 64_000,
    });
    recorderRef.current = rec;
    const started = performance.now();
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      clearInterval(tick);
      const blob = new Blob(chunks, { type: mimeType.current! });
      setPhase({
        k: 'review',
        blob,
        url: URL.createObjectURL(blob),
        durationSec: Math.round((performance.now() - started) / 100) / 10,
      });
    };
    // Timeslice: older iOS Safari only delivers data reliably in chunks.
    rec.start(1000);
    setPhase({ k: 'recording', seconds: 0 });
    const tick = setInterval(() => {
      const s = (performance.now() - started) / 1000;
      if (s >= VIDEO_LIMITS.maxSeconds) {
        if (rec.state === 'recording') rec.stop();
      } else
        setPhase((p) => (p.k === 'recording' ? { k: 'recording', seconds: Math.floor(s) } : p));
    }, 250);
  }

  async function upload(v: { blob: Blob; url: string; durationSec: number }) {
    setError('');
    setPhase({ k: 'uploading', percent: null, ...v });
    try {
      const sha256 = await sha256Hex(v.blob);
      const p = await presign({
        mimeType: mimeType.current!,
        sizeBytes: v.blob.size,
        durationSec: v.durationSec,
        sha256,
      });
      for (let attempt = 1; ; attempt++) {
        try {
          await putWithProgress(p.uploadUrl, v.blob, p.headers, (f) =>
            setPhase({ k: 'uploading', percent: Math.round(f * 100), ...v }),
          );
          break;
        } catch (e) {
          if (attempt >= 3) throw e;
          await sleep(1500 * attempt);
        }
      }
      await confirm(p.uploadId);
      stopCamera();
      onDone();
    } catch (e) {
      setError(
        e instanceof Error && e.message && !e.message.startsWith('HTTP') && e.message !== 'network'
          ? e.message
          : '',
      );
      setPhase({ k: 'failed', ...v });
    }
  }

  return (
    <Card>
      <h1 className="text-2xl font-semibold">{copy.video.title}</h1>

      {phase.k === 'intro' && (
        <>
          <p className="text-lg">{copy.video.intro}</p>
          <ScriptBox script={script} />
          <PrimaryButton onClick={enableCamera}>{copy.video.enableCamera}</PrimaryButton>
        </>
      )}

      {phase.k === 'starting' && (
        <p className="text-lg" aria-live="polite">
          {copy.video.starting}
        </p>
      )}

      {phase.k === 'problem' && (
        <div className="space-y-3">
          {phase.problem === 'denied' && (
            <>
              <Help title={copy.video.deniedTitle} body={copy.video.deniedBody} />
              <ul className="list-disc space-y-2 pl-5">
                <li>{copy.video.deniedAndroid}</li>
                <li>{copy.video.deniedIos}</li>
              </ul>
            </>
          )}
          {phase.problem === 'busy' && (
            <Help title={copy.video.busyTitle} body={copy.video.busyBody} />
          )}
          {phase.problem === 'unsupported' && (
            <Help title={copy.video.unsupportedTitle} body={copy.video.unsupportedBody} />
          )}
          <PrimaryButton onClick={enableCamera}>{copy.video.deniedRetry}</PrimaryButton>
          <p className="text-slate-700">{fill(copy.video.stillStuck, { business })}</p>
        </div>
      )}

      {live && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              aria-label="Camera preview"
              className="aspect-[3/4] w-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            {phase.k === 'countdown' && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/40 text-8xl font-bold text-white"
                aria-live="assertive"
              >
                {phase.n}
              </div>
            )}
            {phase.k === 'recording' && (
              <div
                className="absolute top-2 left-2 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm text-white"
                aria-live="polite"
              >
                <span className="size-2.5 animate-pulse rounded-full bg-red-500" aria-hidden />
                {fill(copy.video.recording, {
                  seconds: phase.seconds,
                  max: VIDEO_LIMITS.maxSeconds,
                })}
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8 text-white">
              <p className="text-sm opacity-90">{copy.video.say}</p>
              <p className="text-lg leading-snug font-semibold">“{script}”</p>
            </div>
          </div>
          {phase.k === 'ready' && (
            <PrimaryButton onClick={record}>{copy.video.start}</PrimaryButton>
          )}
          {phase.k === 'recording' && (
            <PrimaryButton
              onClick={() => recorderRef.current?.stop()}
              disabled={phase.seconds < VIDEO_LIMITS.minSeconds}
              className="bg-red-700 hover:bg-red-800"
            >
              {phase.seconds < VIDEO_LIMITS.minSeconds
                ? fill(copy.video.minHint, { seconds: VIDEO_LIMITS.minSeconds - phase.seconds })
                : copy.video.stop}
            </PrimaryButton>
          )}
        </div>
      )}

      {(phase.k === 'review' || phase.k === 'uploading' || phase.k === 'failed') && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">{copy.video.reviewTitle}</h2>
          <p>{copy.video.reviewBody}</p>
          <video
            src={phase.url}
            controls
            playsInline
            className="aspect-[3/4] w-full rounded-xl bg-black object-cover"
          />
          {phase.k === 'uploading' ? (
            <div aria-live="polite">
              <div
                className="h-3 overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={phase.percent ?? 0}
              >
                <div
                  className="h-full bg-brand-600 transition-all"
                  style={{ width: `${phase.percent ?? 0}%` }}
                />
              </div>
              <p className="mt-2 text-center">
                {phase.percent === null
                  ? copy.video.preparing
                  : fill(copy.video.uploading, { percent: phase.percent })}
              </p>
            </div>
          ) : (
            <>
              {phase.k === 'failed' && <ErrorText>{error || copy.video.uploadFailed}</ErrorText>}
              <PrimaryButton onClick={() => upload(phase)}>
                {phase.k === 'failed' ? copy.video.retry : copy.video.use}
              </PrimaryButton>
              <SecondaryButton onClick={() => setPhase({ k: 'ready' })} className="w-full">
                {copy.video.retake}
              </SecondaryButton>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function Help({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-lg">{body}</p>
    </>
  );
}

function ScriptBox({ script }: { script: string }) {
  return (
    <div className="rounded-xl bg-brand-50 p-4">
      <p className="text-sm text-slate-700">{copy.video.say}</p>
      <p className="text-lg font-semibold">“{script}”</p>
    </div>
  );
}
