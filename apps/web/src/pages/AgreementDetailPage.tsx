import type { AgreementDetail, AuditEventView } from '@app/shared';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMe } from '../auth/useAuth';
import { usePurge } from '../lib/admin';
import { EVENT_LABEL } from '../components/eventLabels';
import { StatusBadge } from '../components/StatusBadge';
import {
  evidenceBundleHref,
  getPdfUrl,
  getVideoUrl,
  useAgreement,
  useAgreementActions,
} from '../lib/agreements';

const ist = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }) + ' IST';

const btn =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50';
const btnPrimary =
  'rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

export function AgreementDetailPage() {
  const id = useParams().id!;
  const { data: a, isLoading, isError, error } = useAgreement(id);
  if (isLoading) return <p className="text-slate-600">Loading…</p>;
  if (isError || !a)
    return (
      <p role="alert" className="text-red-700">
        {error?.message ?? 'Not found'}
      </p>
    );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link to="/" className="text-sm text-brand-600 underline">
        ← Agreements
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{a.customerName}</h1>
        <StatusBadge status={a.status} />
        <span className="font-mono text-xs text-slate-500">{a.id}</span>
      </div>

      {a.purgedAt && (
        <p role="status" className="rounded-lg bg-slate-200 p-3 text-sm">
          Personal data, files and the audit trail were purged on {ist(a.purgedAt)}. This record is
          kept only to show the agreement existed.
        </p>
      )}
      {a.retentionDueAt && !a.purgedAt && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Past its retention period since {ist(a.retentionDueAt)}. An admin can purge it.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Details a={a} />
          <Documents a={a} />
          <Video a={a} />
          <Timeline events={a.events} />
        </div>
        <div className="space-y-4">
          <Actions a={a} />
          {!a.purgedAt && <Evidence a={a} />}
          <Purge a={a} />
        </div>
      </div>
    </div>
  );
}

function Details({ a }: { a: AgreementDetail }) {
  return (
    <Section title="Customer and package">
      <dl className="grid gap-3 sm:grid-cols-2">
        <Field label="Mobile">{a.customerPhone}</Field>
        <Field label="Email">{a.customerEmail ?? '—'}</Field>
        <Field label="Package">
          {a.packageType} · {a.destination}
        </Field>
        <Field label="Price">
          {a.currency} {Number(a.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </Field>
        <Field label="Template">v{a.templateVersion}</Field>
        <Field label="Consent wording version">{a.consentTextVersion ?? '—'}</Field>
        <Field label="Created">
          {ist(a.createdAt)} by {a.createdBy.name}
        </Field>
        {a.status !== 'SIGNED' && a.status !== 'CANCELLED' && (
          <Field label="Link expires">{a.tokenExpiresAt ? ist(a.tokenExpiresAt) : '—'}</Field>
        )}
        <Field label="Signed">{a.signedAt ? ist(a.signedAt) : '—'}</Field>
        {a.notes && <Field label="Notes">{a.notes}</Field>}
      </dl>
    </Section>
  );
}

function Documents({ a }: { a: AgreementDetail }) {
  const [viewing, setViewing] = useState<{ which: string; url: string } | null>(null);
  const [error, setError] = useState('');
  const run = (fn: () => Promise<void>) => () => fn().catch((e: Error) => setError(e.message));
  const view = (which: 'original' | 'signed') =>
    run(async () => setViewing({ which, url: (await getPdfUrl(a.id, which)).url }));
  const download = (which: 'original' | 'signed') =>
    run(async () => void (window.location.href = (await getPdfUrl(a.id, which, true)).url));

  return (
    <Section title="Documents">
      <div className="flex flex-wrap gap-2">
        {a.signedPdfSha256 && (
          <>
            <button className={btnPrimary} onClick={view('signed')}>
              View signed PDF
            </button>
            <button className={btn} onClick={download('signed')}>
              Download signed PDF
            </button>
          </>
        )}
        <button className={btn} onClick={view('original')}>
          View original PDF
        </button>
        <button className={btn} onClick={download('original')}>
          Download original
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {viewing && (
        <iframe
          key={viewing.url}
          src={viewing.url}
          title={`${viewing.which} PDF`}
          className="mt-3 h-[75vh] w-full rounded border border-slate-200"
        />
      )}
    </Section>
  );
}

function Video({ a }: { a: AgreementDetail }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (!a.hasVideo) {
    return (
      <Section title="Confirmation video">
        <p className="text-slate-600">No video recorded yet.</p>
      </Section>
    );
  }
  return (
    <Section title="Confirmation video">
      <p className="mb-2 text-sm text-slate-600">
        {a.videoDurationSec?.toFixed(1)} s · {a.videoMimeType?.split(';')[0]} · Viewing is recorded
        in the access log.
      </p>
      {url ? (
        <video src={url} controls playsInline className="max-h-[60vh] w-full rounded bg-black" />
      ) : (
        <button
          className={btnPrimary}
          onClick={() =>
            getVideoUrl(a.id).then(
              (r) => setUrl(r.url),
              (e: Error) => setError(e.message),
            )
          }
        >
          Play video
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </Section>
  );
}

function Timeline({ events }: { events: AuditEventView[] }) {
  return (
    <Section title="Timeline">
      <ol className="space-y-3">
        {events.map((e) => (
          <li key={e.id} className="border-l-2 border-slate-300 pl-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{EVENT_LABEL[e.type] ?? e.type}</span>
              <time className="text-xs text-slate-500" dateTime={e.createdAt}>
                {ist(e.createdAt)}
              </time>
            </div>
            {(e.ip || e.userAgent) && (
              <p className="truncate text-xs text-slate-500" title={e.userAgent ?? undefined}>
                {[e.ip, e.userAgent].filter(Boolean).join(' · ')}
              </p>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-500">Details</summary>
              <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2">
                {JSON.stringify(
                  { seq: e.seq, metadata: e.metadata, device: e.deviceInfo, hash: e.hash },
                  null,
                  2,
                )}
              </pre>
            </details>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Actions({ a }: { a: AgreementDetail }) {
  const { cancel, extend, resend } = useAgreementActions(a.id);
  const [hours, setHours] = useState(72);
  const open = a.status !== 'SIGNED' && a.status !== 'CANCELLED';
  const busy = cancel.isPending || extend.isPending || resend.isPending;
  const err = cancel.error ?? extend.error ?? resend.error;

  if (!open || a.purgedAt) return null;
  return (
    <Section title="Actions">
      <div className="space-y-3">
        <button
          className={`${btnPrimary} w-full`}
          disabled={busy}
          onClick={() =>
            window.confirm('Send a new link? The old link will stop working.') && resend.mutate()
          }
        >
          Resend link by email
        </button>
        {resend.data && !resend.data.sent && (
          <p role="alert" className="text-sm text-red-700">
            The new link was created but sending failed. See the timeline.
          </p>
        )}
        <div className="flex gap-2">
          <label htmlFor="extend-hours" className="sr-only">
            Extend by
          </label>
          <select
            id="extend-hours"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="flex-1 rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            {[24, 48, 72, 168].map((h) => (
              <option key={h} value={h}>
                {h / 24} day{h > 24 ? 's' : ''}
              </option>
            ))}
          </select>
          <button className={btn} disabled={busy} onClick={() => extend.mutate(hours)}>
            Extend expiry
          </button>
        </div>
        <button
          className={`${btn} w-full border-red-300 text-red-700`}
          disabled={busy}
          onClick={() => {
            const reason = window.prompt(
              'Cancel this agreement? The customer will no longer be able to sign.\n\nReason (optional):',
            );
            if (reason !== null) cancel.mutate(reason.trim() || undefined);
          }}
        >
          Cancel agreement
        </button>
        {err && (
          <p role="alert" className="text-sm text-red-700">
            {err.message}
          </p>
        )}
      </div>
    </Section>
  );
}

function Evidence({ a }: { a: AgreementDetail }) {
  const { verify } = useAgreementActions(a.id);
  return (
    <Section title="Evidence">
      <div className="space-y-3">
        <a href={evidenceBundleHref(a.id)} download className={`${btnPrimary} block text-center`}>
          Download evidence bundle (ZIP)
        </a>
        <button
          className={`${btn} w-full`}
          disabled={verify.isPending}
          onClick={() => verify.mutate()}
        >
          {verify.isPending ? 'Checking…' : 'Verify integrity'}
        </button>
        {verify.isError && (
          <p role="alert" className="text-sm text-red-700">
            {verify.error.message}
          </p>
        )}
        {verify.data && (
          <div
            role="status"
            className={`rounded-lg p-3 text-sm ${verify.data.ok ? 'bg-green-50' : 'bg-red-50'}`}
          >
            <p className={`font-semibold ${verify.data.ok ? 'text-green-800' : 'text-red-800'}`}>
              {verify.data.ok ? '✓ All checks passed' : '✗ Integrity check FAILED'}
            </p>
            <ul className="mt-2 space-y-2">
              {verify.data.checks.map((c) => (
                <li key={c.name}>
                  <span className={c.ok ? 'text-green-800' : 'text-red-800'}>
                    {c.ok ? '✓' : '✗'} {c.name}
                  </span>
                  <p className="text-xs break-all text-slate-600">{c.detail}</p>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">Checked {ist(verify.data.checkedAt)}</p>
          </div>
        )}
      </div>
    </Section>
  );
}

/** Admin-only: erase personal data, e.g. for a customer's deletion request. */
function Purge({ a }: { a: AgreementDetail }) {
  const { data: me } = useMe();
  const purge = usePurge();
  const navigate = useNavigate();
  const closed = a.status === 'SIGNED' || a.status === 'EXPIRED' || a.status === 'CANCELLED';
  if (me?.role !== 'ADMIN' || a.purgedAt || !closed) return null;
  return (
    <Section title="Delete personal data">
      <p className="mb-3 text-sm text-slate-600">
        For a customer's deletion request or after the retention period. Deletes the PDFs, video,
        audit trail and customer details. Cannot be undone.
      </p>
      <button
        className={`${btn} w-full border-red-300 text-red-700`}
        disabled={purge.isPending}
        onClick={() => {
          const typed = window.prompt(
            `This cannot be undone. Type the agreement ID to confirm:\n${a.id}`,
          );
          if (typed !== null)
            purge.mutate({ id: a.id, confirmId: typed.trim() }, { onSuccess: () => navigate(0) });
        }}
      >
        Purge…
      </button>
      {purge.error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {purge.error.message}
        </p>
      )}
    </Section>
  );
}
