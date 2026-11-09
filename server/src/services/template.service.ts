import type { CreateTemplate, CreateTemplateResult, TemplateView } from '../shared/index.js';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { TEMPLATE_PLACEHOLDERS } from './agreement.service.js';

type Row = {
  id: string;
  name: string;
  version: number;
  active: boolean;
  createdAt: Date;
  bodyHtml?: string;
};
const view = (t: Row): TemplateView => ({
  id: t.id,
  name: t.name,
  version: t.version,
  active: t.active,
  createdAt: t.createdAt.toISOString(),
  ...(t.bodyHtml !== undefined && { bodyHtml: t.bodyHtml }),
});

export function listActiveTemplates() {
  return prisma.agreementTemplate.findMany({
    where: { active: true },
    select: { id: true, name: true, version: true },
    orderBy: [{ name: 'asc' }, { version: 'desc' }],
  });
}

export async function listAllTemplates(): Promise<TemplateView[]> {
  const rows = await prisma.agreementTemplate.findMany({
    select: { id: true, name: true, version: true, active: true, createdAt: true },
    orderBy: [{ name: 'asc' }, { version: 'desc' }],
  });
  return rows.map(view);
}

export async function getTemplate(id: string): Promise<TemplateView> {
  const t = await prisma.agreementTemplate.findUnique({ where: { id } });
  if (!t) throw new HttpError(404, 'Template not found', 'NOT_FOUND');
  return view(t);
}

export const unknownPlaceholders = (html: string) => [
  ...new Set(
    [...html.matchAll(/\{\{\s*(\w+)\s*\}\}/g)]
      .map((m) => m[1]!)
      .filter((k) => !TEMPLATE_PLACEHOLDERS.includes(k)),
  ),
];

/**
 * Templates are never edited in place: saving creates the next version for that name and retires
 * the previous one, so every agreement keeps pointing at the exact wording it was created from.
 */
export async function createTemplateVersion(input: CreateTemplate): Promise<CreateTemplateResult> {
  const t = await prisma.$transaction(async (tx) => {
    const latest = await tx.agreementTemplate.findFirst({
      where: { name: input.name },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    await tx.agreementTemplate.updateMany({
      where: { name: input.name, active: true },
      data: { active: false },
    });
    return tx.agreementTemplate.create({
      data: {
        name: input.name,
        bodyHtml: input.bodyHtml,
        version: (latest?.version ?? 0) + 1,
        active: true,
      },
    });
  });
  return { template: view(t), unknownPlaceholders: unknownPlaceholders(input.bodyHtml) };
}

export async function setTemplateActive(id: string, active: boolean): Promise<TemplateView> {
  await getTemplate(id);
  const t = await prisma.agreementTemplate.update({ where: { id }, data: { active } });
  return view({ ...t, bodyHtml: undefined });
}
