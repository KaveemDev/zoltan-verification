import type { ReactNode } from 'react';

export const btn =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50';
export const btnPrimary =
  'rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50';
export const input = 'w-full rounded-lg border border-slate-300 px-3 py-2';

export const ist = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </section>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">{children}</div>
  );
}

export const th = 'px-3 py-2 text-left font-medium text-slate-600';
export const td = 'px-3 py-2 border-t border-slate-100';

export function Err({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="text-sm text-red-700">
      {error.message}
    </p>
  ) : null;
}
