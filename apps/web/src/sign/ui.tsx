import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function PrimaryButton({
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`min-h-12 w-full rounded-xl bg-brand-600 px-4 py-3 text-lg font-semibold text-white hover:bg-brand-700 disabled:bg-slate-400 ${className}`}
    />
  );
}

export function SecondaryButton({
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-800 disabled:opacity-50 ${className}`}
    />
  );
}

export function Checkbox({
  id,
  checked,
  onChange,
  disabled,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex gap-3 rounded-xl border p-4 ${disabled ? 'border-slate-200 text-slate-400' : 'border-slate-300 bg-white'}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-6 shrink-0 accent-brand-600"
      />
      <span className="text-base">{children}</span>
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <p role="alert" className="text-base text-red-700">
      {children}
    </p>
  ) : null;
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">{children}</div>;
}
