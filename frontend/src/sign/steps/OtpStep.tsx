import type { CodeChannel, OtpSendResult, OtpVerifyResult } from '../../shared/index';
import { useEffect, useState } from 'react';
import { copy, fill } from '../copy';
import { session, signApi, SignApiError } from '../signApi';
import { Card, ErrorText, PrimaryButton, SecondaryButton } from '../ui';

export function OtpStep({
  token,
  channel,
  destination,
  notice,
  onVerified,
}: {
  token: string;
  channel: CodeChannel;
  destination: string;
  notice?: string;
  onVerified: () => void;
}) {
  const [sentAt, setSentAt] = useState<OtpSendResult | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const waitSec = sentAt
    ? Math.max(0, Math.ceil((Date.parse(sentAt.resendAvailableAt) - now) / 1000))
    : 0;

  async function send() {
    setBusy('send');
    setError('');
    try {
      setSentAt(await signApi<OtpSendResult>(token, '/otp/send', { method: 'POST' }));
      setCode('');
    } catch (e) {
      if (e instanceof SignApiError && e.code === 'OTP_COOLDOWN') {
        setSentAt({ expiresAt: '', resendAvailableAt: String(e.body.resendAvailableAt) });
      } else setError(e instanceof SignApiError && e.status ? e.message : copy.common.genericError);
    } finally {
      setBusy(null);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError(fill(copy.otp.label, {}));
    setBusy('verify');
    setError('');
    try {
      const res = await signApi<OtpVerifyResult>(token, '/otp/verify', {
        method: 'POST',
        body: { code },
      });
      session.set(token, res.sessionToken);
      onVerified();
    } catch (err) {
      if (err instanceof SignApiError && err.code === 'OTP_INVALID') {
        setError(fill(copy.otp.attemptsLeft, { count: Number(err.body.attemptsLeft) }));
      } else
        setError(
          err instanceof SignApiError && err.status ? err.message : copy.common.genericError,
        );
      setCode('');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <h1 className="text-2xl font-semibold">{copy.otp.title}</h1>
      {notice && <p className="rounded-lg bg-amber-50 p-3 text-amber-900">{notice}</p>}
      <p className="text-lg">{fill(copy.otp.body[channel], { destination })}</p>

      {!sentAt ? (
        <PrimaryButton onClick={send} disabled={busy === 'send'}>
          {busy === 'send' ? copy.otp.sending : copy.otp.send}
        </PrimaryButton>
      ) : (
        <form onSubmit={verify} className="space-y-4" noValidate>
          <p className="text-slate-700">{copy.otp.sent[channel]}</p>
          <div>
            <label htmlFor="otp" className="block font-medium">
              {copy.otp.label}
            </label>
            <input
              id="otp"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              autoFocus
              aria-invalid={!!error}
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-center font-mono text-3xl tracking-[0.4em]"
            />
          </div>
          <PrimaryButton type="submit" disabled={busy === 'verify' || code.length !== 6}>
            {busy === 'verify' ? copy.otp.verifying : copy.otp.verify}
          </PrimaryButton>
          <SecondaryButton
            type="button"
            onClick={send}
            disabled={waitSec > 0 || busy !== null}
            className="w-full"
          >
            {waitSec > 0 ? fill(copy.otp.resendIn, { seconds: waitSec }) : copy.otp.resend}
          </SecondaryButton>
        </form>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
