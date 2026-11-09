import { zodResolver } from '@hookform/resolvers/zod';
import {
  createAgreementSchema,
  PackageType,
  type CreateAgreement,
  type CreateAgreementInput,
} from '../shared/index';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { useCreateAgreement, useTemplates } from '../lib/agreements';

const PACKAGE_LABEL: Record<PackageType, string> = {
  VISA: 'Visa',
  TRAVEL: 'Travel',
  BOTH: 'Visa + travel',
};
const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5';

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function NewAgreementPage() {
  const navigate = useNavigate();
  const templates = useTemplates();
  const create = useCreateAgreement();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateAgreementInput, unknown, CreateAgreement>({
    resolver: zodResolver(createAgreementSchema),
    defaultValues: { currency: 'INR', packageType: 'VISA' },
  });
  const a11y = (k: keyof CreateAgreementInput) => ({
    id: k,
    'aria-invalid': !!errors[k],
    'aria-describedby': errors[k] ? `${k}-error` : undefined,
  });

  return (
    <section className="mx-auto max-w-2xl">
      <Link to="/" className="text-sm text-brand-600 underline">
        ← Agreements
      </Link>
      <h1 className="mt-2 mb-4 text-xl font-semibold">New agreement</h1>
      <form
        noValidate
        onSubmit={handleSubmit((v) => create.mutate(v, { onSuccess: () => navigate('/') }))}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
      >
        <Field id="customerName" label="Customer full name" error={errors.customerName?.message}>
          <input
            {...register('customerName')}
            {...a11y('customerName')}
            autoComplete="off"
            className={input}
          />
        </Field>
        <Field
          id="customerPhone"
          label="Mobile number (with country code)"
          error={errors.customerPhone?.message}
        >
          <input
            {...register('customerPhone')}
            {...a11y('customerPhone')}
            type="tel"
            inputMode="tel"
            placeholder="+919876543210"
            className={input}
          />
        </Field>
        <Field
          id="customerEmail"
          label="Email (the signing link is sent here)"
          error={errors.customerEmail?.message}
        >
          <input
            {...register('customerEmail')}
            {...a11y('customerEmail')}
            type="email"
            className={input}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="packageType" label="Package" error={errors.packageType?.message}>
            <select {...register('packageType')} {...a11y('packageType')} className={input}>
              {PackageType.options.map((p) => (
                <option key={p} value={p}>
                  {PACKAGE_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="destination" label="Destination country" error={errors.destination?.message}>
            <input {...register('destination')} {...a11y('destination')} className={input} />
          </Field>
          <Field id="price" label="Package price" error={errors.price?.message}>
            <input
              {...register('price')}
              {...a11y('price')}
              inputMode="decimal"
              className={input}
            />
          </Field>
          <Field id="currency" label="Currency" error={errors.currency?.message}>
            <input
              {...register('currency')}
              {...a11y('currency')}
              maxLength={3}
              className={`${input} uppercase`}
            />
          </Field>
        </div>
        <Field id="templateId" label="Agreement template" error={errors.templateId?.message}>
          <select
            {...register('templateId')}
            {...a11y('templateId')}
            className={input}
            disabled={templates.isLoading}
          >
            <option value="">{templates.isLoading ? 'Loading…' : 'Choose a template'}</option>
            {templates.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (v{t.version})
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="notes"
          label="Extra notes (optional, shown in the agreement)"
          error={errors.notes?.message}
        >
          <textarea {...register('notes')} {...a11y('notes')} rows={3} className={input} />
        </Field>

        {create.isError && (
          <p role="alert" className="text-sm text-red-700">
            {create.error.message}
          </p>
        )}
        <button
          type="submit"
          disabled={create.isPending}
          className="w-full rounded-lg bg-brand-600 px-4 py-3 font-medium text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto"
        >
          {create.isPending ? 'Creating and sending…' : 'Create and email the link'}
        </button>
      </form>
    </section>
  );
}
