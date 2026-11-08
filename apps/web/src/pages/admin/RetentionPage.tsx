import { Link } from 'react-router';
import { usePurge, useRetention } from '../../lib/admin';
import { StatusBadge } from '../../components/StatusBadge';
import { btn, Err, ist, Page, Panel, td, th } from './ui';

export function RetentionPage() {
  const { data, isLoading, error } = useRetention();
  const purge = usePurge();

  const confirmPurge = (id: string, name: string) => {
    const typed = window.prompt(
      `Permanently delete ${name}'s files (PDFs, video), audit trail and personal details?\n` +
        'This cannot be undone. A record that the purge happened is kept in the access log.\n\n' +
        `Type the agreement ID to confirm:\n${id}`,
    );
    if (typed !== null) purge.mutate({ id, confirmId: typed.trim() });
  };

  return (
    <Page title="Retention">
      <p className="text-sm text-slate-600">
        Agreements past the retention period (set by RETENTION_YEARS, default 3 years after signing)
        are listed here by a daily job. Nothing is deleted automatically. Purging is also how you
        act on a customer's deletion request: cancel the agreement first if it is still open.
      </p>
      <Panel>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={th}>Customer</th>
              <th className={th}>Status</th>
              <th className={th}>Signed</th>
              <th className={th}>Due since</th>
              <th className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className={td} colSpan={5}>
                  Loading…
                </td>
              </tr>
            )}
            {data?.length === 0 && (
              <tr>
                <td className={td} colSpan={5}>
                  Nothing is due for deletion.
                </td>
              </tr>
            )}
            {data?.map((a) => (
              <tr key={a.id}>
                <td className={td}>
                  <Link to={`/agreements/${a.id}`} className="text-brand-600 underline">
                    {a.customerName}
                  </Link>
                  <div className="font-mono text-xs text-slate-500">{a.id}</div>
                </td>
                <td className={td}>
                  <StatusBadge status={a.status} />
                </td>
                <td className={td}>{a.signedAt ? ist(a.signedAt) : '—'}</td>
                <td className={td}>{ist(a.retentionDueAt)}</td>
                <td className={td}>
                  <button
                    className={`${btn} border-red-300 text-red-700`}
                    disabled={purge.isPending}
                    onClick={() => confirmPurge(a.id, a.customerName)}
                  >
                    Purge…
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Err error={error ?? purge.error} />
    </Page>
  );
}
