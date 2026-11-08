import { Router } from 'express';
import { createTemplateSchema, updateTemplateSchema } from '@app/shared';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import {
  createTemplateVersion,
  getTemplate,
  listActiveTemplates,
  listAllTemplates,
  setTemplateActive,
} from '../services/template.service.js';

export const templatesRouter = Router();
templatesRouter.use(requireAuth, requireCsrf);
const admin = requireRole('ADMIN');

// Staff: active templates for the "New agreement" dropdown. Admin with ?all=1: every version.
templatesRouter.get('/', async (req, res) => {
  res.json(
    req.query.all === '1' && req.user!.role === 'ADMIN'
      ? await listAllTemplates()
      : await listActiveTemplates(),
  );
});

templatesRouter.get('/:id', admin, async (req, res) => {
  res.json(await getTemplate(String(req.params.id)));
});

templatesRouter.post('/', admin, async (req, res) => {
  res.status(201).json(await createTemplateVersion(createTemplateSchema.parse(req.body)));
});

templatesRouter.patch('/:id', admin, async (req, res) => {
  const { active } = updateTemplateSchema.parse(req.body);
  res.json(await setTemplateActive(String(req.params.id), active));
});
