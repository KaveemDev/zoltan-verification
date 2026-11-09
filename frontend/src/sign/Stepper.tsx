import { copy, fill } from './copy';

export const STEP_KEYS = ['verify', 'read', 'consent', 'video', 'sign'] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export function Stepper({ current }: { current: StepKey }) {
  const index = STEP_KEYS.indexOf(current);
  return (
    <nav
      aria-label={fill(copy.progress, { current: index + 1, total: STEP_KEYS.length })}
      className="mb-5"
    >
      <ol className="flex gap-1.5">
        {STEP_KEYS.map((k, i) => (
          <li key={k} className="flex-1" aria-current={i === index ? 'step' : undefined}>
            <div className={`h-1.5 rounded-full ${i <= index ? 'bg-brand-600' : 'bg-slate-300'}`} />
            <span
              className={`mt-1 block text-xs ${i === index ? 'font-semibold text-slate-900' : 'text-slate-500'}`}
            >
              {copy.steps[k]}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
