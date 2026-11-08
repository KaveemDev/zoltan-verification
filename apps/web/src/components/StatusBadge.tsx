import type { AgreementStatus } from '@app/shared';

const STYLES: Record<AgreementStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SENT: 'bg-blue-100 text-blue-800',
  OPENED: 'bg-indigo-100 text-indigo-800',
  VERIFIED: 'bg-amber-100 text-amber-900',
  SIGNED: 'bg-green-100 text-green-800',
  EXPIRED: 'bg-orange-100 text-orange-900',
  CANCELLED: 'bg-red-100 text-red-800',
};

export function StatusBadge({ status }: { status: AgreementStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
