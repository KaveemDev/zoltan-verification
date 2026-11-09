import { fillLegal, LEGAL_TEXT } from '../../shared/index';
import { useState } from 'react';
import { copy } from '../copy';
import { Card, Checkbox, ErrorText, PrimaryButton } from '../ui';

export function ConsentStep({
  business,
  onDone,
}: {
  business: string;
  onDone: () => Promise<void>;
}) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function next() {
    setBusy(true);
    setError('');
    try {
      await onDone();
    } catch (e) {
      setError((e as Error).message || copy.common.genericError);
      setBusy(false);
    }
  }

  return (
    <Card>
      <h1 className="text-2xl font-semibold">{copy.consent.title}</h1>
      <p className="text-lg leading-relaxed">
        {fillLegal(LEGAL_TEXT.recordingNotice, { businessName: business })}
      </p>
      <a
        href="/privacy"
        target="_blank"
        rel="noopener"
        className="inline-block py-2 text-brand-600 underline"
      >
        {copy.consent.privacy}
      </a>
      <Checkbox id="consent-recording" checked={checked} onChange={setChecked}>
        {LEGAL_TEXT.recordingConsent}
      </Checkbox>
      <ErrorText>{error}</ErrorText>
      <PrimaryButton onClick={next} disabled={!checked || busy}>
        {copy.common.continue}
      </PrimaryButton>
    </Card>
  );
}
