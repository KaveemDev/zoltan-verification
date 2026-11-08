import type { CreateTemplateResult } from '@app/shared';
import { useState } from 'react';
import { getTemplate, useAllTemplates, useTemplateMutations } from '../../lib/admin';
import { btn, btnPrimary, Err, input, ist, Page, Panel, td, th } from './ui';

const PLACEHOLDERS =
  'businessName, customerName, customerPhone, customerEmail, packageType, destination, price, currency, notes, agreementId, date';

export function TemplatesPage() {
  const { data: templates, isLoading, error } = useAllTemplates();
  const { create, setActive } = useTemplateMutations();
  const [name, setName] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [result, setResult] = useState<CreateTemplateResult | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);

  const editFrom = async (id: string) => {
    try {
      const t = await getTemplate(id);
      setName(t.name);
      setBodyHtml(t.bodyHtml ?? '');
      setResult(null);
      document.getElementById('tpl-name')?.focus();
    } catch (e) {
      setLoadError(e as Error);
    }
  };

  return (
    <Page title="Agreement templates">
      <p className="text-sm text-slate-600">
        Saving never changes an existing template: it adds a new version and retires the previous
        one. Agreements always keep the exact version they were created from.
      </p>
      <Panel>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Version</th>
              <th className={th}>Status</th>
              <th className={th}>Created</th>
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
            {templates?.map((t) => (
              <tr key={t.id} className={t.active ? '' : 'text-slate-400'}>
                <td className={td}>{t.name}</td>
                <td className={td}>v{t.version}</td>
                <td className={td}>{t.active ? 'In use' : 'Retired'}</td>
                <td className={td}>{ist(t.createdAt)}</td>
                <td className={`${td} space-x-2 whitespace-nowrap`}>
                  <button className={btn} onClick={() => editFrom(t.id)}>
                    New version from this
                  </button>
                  <button
                    className={btn}
                    disabled={setActive.isPending}
                    onClick={() => setActive.mutate({ id: t.id, active: !t.active })}
                  >
                    {t.active ? 'Retire' : 'Use again'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Err error={error ?? setActive.error ?? loadError} />

      <form
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ name, bodyHtml }, { onSuccess: setResult });
        }}
      >
        <h2 className="font-semibold">Save a template version</h2>
        <div>
          <label htmlFor="tpl-name" className="block text-sm font-medium">
            Name (same name = new version)
          </label>
          <input
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label htmlFor="tpl-body" className="block text-sm font-medium">
            Body (HTML)
          </label>
          <p className="text-xs text-slate-600">
            Placeholders:{' '}
            {PLACEHOLDERS.split(', ')
              .map((p) => `{{${p}}}`)
              .join(', ')}
          </p>
          <textarea
            id="tpl-body"
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={16}
            className={`${input} font-mono text-xs`}
          />
        </div>
        <Err error={create.error} />
        {result && (
          <p role="status" className="text-sm text-green-800">
            Saved {result.template.name} v{result.template.version}.
            {result.unknownPlaceholders.length > 0 && (
              <span className="block text-amber-800">
                Warning: these placeholders won't be filled in:{' '}
                {result.unknownPlaceholders.map((p) => `{{${p}}}`).join(', ')}
              </span>
            )}
          </p>
        )}
        <button
          type="submit"
          className={btnPrimary}
          disabled={create.isPending || !name || !bodyHtml}
        >
          Save new version
        </button>
      </form>
    </Page>
  );
}
