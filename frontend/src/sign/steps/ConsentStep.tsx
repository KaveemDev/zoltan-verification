import { useState } from 'react';
import { copy } from '../copy';
import { Card, ErrorText, PrimaryButton } from '../ui';

export function ConsentStep({
  onDone,
}: {
  onDone: () => Promise<void>;
}) {
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
      <p className="text-lg leading-relaxed">{copy.consent.ask}</p>
      <ErrorText>{error}</ErrorText>
      <PrimaryButton onClick={next} disabled={busy}>
        {copy.common.continue}
      </PrimaryButton>
    </Card>
  );
}
