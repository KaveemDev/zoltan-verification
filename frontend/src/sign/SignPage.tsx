import {
  LEGAL_TEXT_VERSION,
  type CompleteSigningResult,
  type PublicAgreementInfo,
  type SigningDocument,
  type VideoPresignResult,
} from '../shared/index';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { DEMO } from '../demo';
import { copy, fill, PACKAGE_LABEL } from './copy';
import { session, signApi, SignApiError } from './signApi';
import { Stepper, type StepKey } from './Stepper';
import { ConsentStep } from './steps/ConsentStep';
import { OtpStep } from './steps/OtpStep';
import { ReadStep } from './steps/ReadStep';
import { SignatureStep } from './steps/SignatureStep';
import { VideoStep } from './steps/VideoStep';
import { Card, PrimaryButton } from './ui';

type Step = 'landing' | StepKey | 'done';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export function SignPage() {
  const token = useParams().token!;
  const [step, setStep] = useState<Step>('landing');
  const [doc, setDoc] = useState<SigningDocument | null>(null);
  const [otpNotice, setOtpNotice] = useState<string>();
  const [result, setResult] = useState<CompleteSigningResult | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const info = useQuery({
    queryKey: ['sign', token],
    queryFn: () => signApi<PublicAgreementInfo>(token, ''),
    retry: (n, e) => !(e instanceof SignApiError && e.status >= 400 && e.status < 500) && n < 2,
    staleTime: Infinity,
  });

  /** Runs a session-authenticated call; an expired session sends the customer back to the code step. */
  async function authed<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof SignApiError) {
        if (e.code === 'SESSION_EXPIRED') {
          session.clear(token);
          setOtpNotice(copy.otp.sessionExpired);
          setStep('verify');
        } else if (e.code in copy.errors) setFatal(e.code);
        else if (e.code === 'LEGAL_TEXT_CHANGED') window.location.reload();
        if (e.status) throw e;
      }
      throw new Error(copy.common.genericError);
    }
  }

  async function loadDocAndResume() {
    const d = await authed(() => signApi<SigningDocument>(token, '/document', { auth: true }));
    setDoc(d);
    setStep(
      !d.progress.viewed
        ? 'read'
        : !d.progress.recordingConsented
          ? 'consent'
          : !d.progress.videoRecorded
            ? 'video'
            : 'sign',
    );
  }

  const start = () =>
    session.get(token) ? loadDocAndResume().catch(() => undefined) : setStep('verify');

  const errorCode = fatal ?? (info.error instanceof SignApiError ? info.error.code : null);
  if (errorCode || info.isError) {
    const e = copy.errors[errorCode as keyof typeof copy.errors];
    const business = info.data?.businessName ?? 'the business';
    return (
      <Shell>
        <Card>
          <h1 className="text-2xl font-semibold">{e?.title ?? copy.common.genericError}</h1>
          {e && <p className="text-lg">{fill(e.body, { business })}</p>}
          {!e && (
            <PrimaryButton onClick={() => info.refetch()}>{copy.common.tryAgain}</PrimaryButton>
          )}
        </Card>
      </Shell>
    );
  }
  if (info.isLoading || !info.data)
    return (
      <Shell>
        <p className="p-6 text-center">{copy.common.loading}</p>
      </Shell>
    );

  const a = info.data;
  const business = a.businessName;

  return (
    <Shell business={business}>
      {step !== 'landing' && step !== 'done' && <Stepper current={step} />}

      {step === 'landing' && (
        <Card>
          <h1 className="text-2xl font-semibold">
            {fill(copy.landing.title, { name: a.customerName })}
          </h1>
          <p className="text-lg">
            {fill(copy.landing.body, {
              business,
              package: PACKAGE_LABEL[a.packageType],
              destination: a.destination,
            })}
          </p>
          <p className="text-lg">{copy.landing.how}</p>
          <PrimaryButton onClick={start}>{copy.landing.start}</PrimaryButton>
          <p className="text-sm text-slate-600">
            {fill(copy.landing.expires, { date: fmtDate(a.expiresAt) })}
          </p>
        </Card>
      )}

      {step === 'verify' && (
        <OtpStep
          token={token}
          channel={a.codeChannel}
          destination={a.codeDestination}
          notice={otpNotice ?? (DEMO ? 'Demo: enter any 6-digit code, e.g. 123456.' : undefined)}
          onVerified={() => {
            setOtpNotice(undefined);
            loadDocAndResume().catch(() => undefined);
          }}
        />
      )}

      {step === 'read' && doc && (
        <ReadStep
          doc={doc}
          business={business}
          onReload={() => loadDocAndResume().catch(() => undefined)}
          onDone={async (v) => {
            await authed(() =>
              signApi(token, '/events', {
                method: 'POST',
                auth: true,
                body: { type: 'AGREEMENT_VIEWED', ...v },
              }),
            );
            setStep('consent');
          }}
        />
      )}

      {step === 'consent' && (
        <ConsentStep
          business={business}
          onDone={async () => {
            await authed(() =>
              signApi(token, '/events', {
                method: 'POST',
                auth: true,
                body: { type: 'RECORDING_CONSENT_GIVEN', legalTextVersion: LEGAL_TEXT_VERSION },
              }),
            );
            setStep('video');
          }}
        />
      )}

      {step === 'video' && (
        <VideoStep
          business={business}
          script={fill(copy.video.script, {
            name: a.customerName,
            package: PACKAGE_LABEL[a.packageType],
            business,
          })}
          presign={(v) =>
            authed(() =>
              signApi<VideoPresignResult>(token, '/video/presign', {
                method: 'POST',
                auth: true,
                body: v,
              }),
            )
          }
          confirm={(uploadId) =>
            authed(() =>
              signApi<void>(token, '/video/confirm', {
                method: 'POST',
                auth: true,
                body: { uploadId },
              }),
            )
          }
          onDone={() => setStep('sign')}
        />
      )}

      {step === 'sign' && (
        <SignatureStep
          onSubmit={async (v) => {
            const r = await authed(() =>
              signApi<CompleteSigningResult>(token, '/complete', {
                method: 'POST',
                auth: true,
                body: { ...v, agreed: true, legalTextVersion: LEGAL_TEXT_VERSION },
              }),
            );
            session.clear(token);
            setResult(r);
            setStep('done');
          }}
        />
      )}

      {step === 'done' && result && (
        <Card>
          <div
            aria-hidden
            className="mx-auto flex size-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700"
          >
            ✓
          </div>
          <h1 className="text-center text-2xl font-semibold">{copy.done.title}</h1>
          <p className="text-lg">
            {fill(copy.done.body, { business, date: fmtDate(result.signedAt) })}
          </p>
          <p className="text-sm text-slate-600">
            {copy.done.id}: <span className="font-mono break-all">{result.agreementId}</span>
          </p>
          <p className="text-lg">{fill(copy.done.next, { business })}</p>
        </Card>
      )}
    </Shell>
  );
}

function Shell({ business, children }: { business?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-t-4 border-brand-500 bg-white px-4 py-3 shadow-sm">
        <img src="/logo.png" alt={business ?? 'Zoltan Visa'} className="mx-auto h-9 w-auto" />
      </header>
      <main className="mx-auto max-w-md px-4 py-5">{children}</main>
    </div>
  );
}
