import { LEGAL_TEXT, type SigningDocument } from '../../shared/index';
import { useState } from 'react';
import { copy, fill, PACKAGE_LABEL } from '../copy';
import { Card, Checkbox, ErrorText, PrimaryButton, SecondaryButton } from '../ui';
import { PdfViewer } from './PdfViewer';

export function ReadStep({
  doc,
  business,
  onDone,
  onReload,
}: {
  doc: SigningDocument;
  business: string;
  onDone: (v: { pagesViewed: number; totalPages: number; secondsOnPage: number }) => Promise<void>;
  onReload: () => void;
}) {
  const [progress, setProgress] = useState({ seen: 0, total: 0 });
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const allRead = progress.total > 0 && progress.seen >= progress.total;
  const vars = {
    business,
    package: PACKAGE_LABEL[doc.packageType],
    destination: doc.destination,
    currency: doc.currency,
    price: Number(doc.price).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
  };

  async function next() {
    setBusy(true);
    setError('');
    try {
      await onDone({
        pagesViewed: progress.seen,
        totalPages: progress.total,
        secondsOnPage: Math.round((Date.now() - startedAt) / 1000),
      });
    } catch (e) {
      setError((e as Error).message || copy.common.genericError);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-2xl font-semibold">{copy.read.title}</h1>
        <div className="rounded-xl bg-brand-50 p-4">
          <h2 className="mb-2 font-semibold">{copy.read.summaryTitle}</h2>
          <ul className="list-disc space-y-1 pl-5">
            {copy.read.summary.map((s) => (
              <li key={s}>{fill(s, vars)}</li>
            ))}
          </ul>
        </div>
      </Card>

      {loadFailed ? (
        <Card>
          <ErrorText>{copy.read.loadFailed}</ErrorText>
          <SecondaryButton onClick={onReload} className="w-full">
            {copy.common.tryAgain}
          </SecondaryButton>
        </Card>
      ) : (
        <PdfViewer
          url={doc.pdfUrl}
          onProgress={(seen, total) => setProgress({ seen, total })}
          onError={() => setLoadFailed(true)}
        />
      )}

      <div className="sticky bottom-0 space-y-3 bg-slate-50/95 py-3 backdrop-blur">
        <p className="text-center text-sm text-slate-600" aria-live="polite">
          {allRead ? fill(copy.read.pagesSeen, progress) : copy.read.scrollHint}
        </p>
        <Checkbox id="agree-read" checked={agreed} onChange={setAgreed} disabled={!allRead}>
          {LEGAL_TEXT.agreementConsent}
        </Checkbox>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton onClick={next} disabled={!allRead || !agreed || busy}>
          {copy.common.continue}
        </PrimaryButton>
      </div>
    </div>
  );
}
