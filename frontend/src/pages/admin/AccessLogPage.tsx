import { useState } from 'react';
import { Link } from 'react-router';
import { useAccessLog } from '../../lib/admin';
import { btn, Err, ist, Page, Panel, td, th } from './ui';

const ACTION_LABEL: Record<string, string> = {
  VIDEO_VIEWED: 'Viewed video',
  PDF_VIEWED: 'Viewed PDF',
  PDF_DOWNLOADED: 'Downloaded PDF',
  BUNDLE_DOWNLOADED: 'Downloaded evidence bundle',
  INTEGRITY_CHECKED: 'Ran integrity check',
  PURGED: 'Purged agreement',
};

export function AccessLogPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useAccessLog(page);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <Page title="Access log">
      <Panel>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={th}>When</th>
              <th className={th}>Who</th>
              <th className={th}>What</th>
              <th className={th}>Agreement</th>
              <th className={th}>IP</th>
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
            {data?.items.length === 0 && (
              <tr>
                <td className={td} colSpan={5}>
                  Nothing yet.
                </td>
              </tr>
            )}
            {data?.items.map((r) => (
              <tr key={r.id}>
                <td className={`${td} whitespace-nowrap`}>{ist(r.createdAt)}</td>
                <td className={td}>{r.user.name}</td>
                <td className={td}>{ACTION_LABEL[r.action] ?? r.action}</td>
                <td className={`${td} font-mono text-xs`}>
                  {r.agreementId ? (
                    <Link to={`/agreements/${r.agreementId}`} className="text-brand-600 underline">
                      {r.agreementId}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={td}>{r.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Err error={error} />
      {data && data.total > data.pageSize && (
        <nav aria-label="Pagination" className="flex items-center gap-3 text-sm">
          <button className={btn} disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button className={btn} disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </nav>
      )}
    </Page>
  );
}
