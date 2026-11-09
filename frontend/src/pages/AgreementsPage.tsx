import { AgreementStatus, PackageType, type ListAgreementsQuery } from '../shared/index';
import { Link, useSearchParams } from 'react-router';
import { StatusBadge } from '../components/StatusBadge';
import { useAgreements } from '../lib/agreements';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export function AgreementsPage() {
  const [params, setParams] = useSearchParams();
  const query: ListAgreementsQuery = {
    q: params.get('q') ?? undefined,
    status: (params.get('status') as AgreementStatus | null) ?? undefined,
    packageType: (params.get('packageType') as PackageType | null) ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    page: Number(params.get('page') ?? 1),
  };
  const { data, isLoading, isError, isFetching } = useAgreements(query);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const update = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p);
  };

  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Agreements</h1>
        <Link
          to="/agreements/new"
          className="rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700"
        >
          New agreement
        </Link>
      </div>

      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get('q') as string;
          update({ q: q.trim() || undefined, page: undefined });
        }}
      >
        <label htmlFor="q" className="sr-only">
          Search
        </label>
        <input
          id="q"
          name="q"
          defaultValue={query.q}
          placeholder="Name, phone or agreement ID"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2"
        />
        <label htmlFor="status" className="sr-only">
          Status
        </label>
        <select
          id="status"
          value={query.status ?? ''}
          onChange={(e) => update({ status: e.target.value, page: undefined })}
          className="rounded-lg border border-slate-300 px-3 py-2"
        >
          <option value="">All statuses</option>
          {AgreementStatus.options.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label htmlFor="packageType" className="sr-only">
          Package
        </label>
        <select
          id="packageType"
          value={query.packageType ?? ''}
          onChange={(e) => update({ packageType: e.target.value, page: undefined })}
          className="rounded-lg border border-slate-300 px-3 py-2"
        >
          <option value="">All packages</option>
          {PackageType.options.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm text-slate-600">
          From
          <input
            type="date"
            value={query.from ?? ''}
            onChange={(e) => update({ from: e.target.value, page: undefined })}
            className="rounded-lg border border-slate-300 px-2 py-2"
          />
        </label>
        <label className="flex items-center gap-1 text-sm text-slate-600">
          To
          <input
            type="date"
            value={query.to ?? ''}
            onChange={(e) => update({ to: e.target.value, page: undefined })}
            className="rounded-lg border border-slate-300 px-2 py-2"
          />
        </label>
        <button type="submit" className="rounded-lg border border-slate-300 bg-white px-4 py-2">
          Search
        </button>
      </form>

      {isLoading ? (
        <p className="text-slate-600">Loading…</p>
      ) : isError ? (
        <p role="alert" className="text-red-700">
          Could not load agreements.
        </p>
      ) : data!.items.length === 0 ? (
        <p className="text-slate-600">No agreements found.</p>
      ) : (
        <div
          className={`overflow-x-auto rounded-lg border border-slate-200 bg-white ${isFetching ? 'opacity-70' : ''}`}
        >
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Package</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {data!.items.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      to={`/agreements/${a.id}`}
                      className="font-medium text-brand-600 underline"
                    >
                      {a.customerName}
                    </Link>
                    <div className="font-mono text-xs text-slate-500">{a.id}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{a.customerPhone}</td>
                  <td className="px-3 py-2">
                    {a.packageType} · {a.destination}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmt(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > data.pageSize && (
        <nav aria-label="Pagination" className="mt-4 flex items-center gap-3 text-sm">
          <button
            disabled={data.page <= 1}
            onClick={() => update({ page: String(data.page - 1) })}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-50"
          >
            Previous
          </button>
          <span>
            Page {data.page} of {pages}
          </span>
          <button
            disabled={data.page >= pages}
            onClick={() => update({ page: String(data.page + 1) })}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-50"
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
