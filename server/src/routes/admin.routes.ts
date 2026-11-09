import { Router } from 'express';
import {
  accessLogQuery,
  createUserSchema,
  purgeSchema,
  updateUserSchema,
} from '../shared/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { listAccessLog } from '../services/access-log.service.js';
import { listRetentionDue, purgeAgreement } from '../services/retention.service.js';
import { createUser, listUsers, updateUser } from '../services/users.service.js';

/** Admin-only endpoints, mounted at /api/v1. */
export const adminRouter = Router();
adminRouter.use(
  ['/users', '/access-log', '/retention'],
  requireAuth,
  requireRole('ADMIN'),
  requireCsrf,
);

adminRouter.get('/users', async (_req, res) => {
  res.json(await listUsers());
});

adminRouter.post('/users', async (req, res) => {
  res.status(201).json(await createUser(createUserSchema.parse(req.body)));
});

adminRouter.patch('/users/:id', async (req, res) => {
  res.json(
    await updateUser(String(req.params.id), updateUserSchema.parse(req.body), req.user!.sub),
  );
});

adminRouter.get('/access-log', async (req, res) => {
  res.json(await listAccessLog(accessLogQuery.parse(req.query)));
});

adminRouter.get('/retention', async (_req, res) => {
  res.json(await listRetentionDue());
});

adminRouter.post('/retention/:id/purge', async (req, res) => {
  const { confirmId } = purgeSchema.parse(req.body);
  await purgeAgreement(String(req.params.id), confirmId, req.user!.sub, req.ip ?? null);
  res.status(204).end();
});
