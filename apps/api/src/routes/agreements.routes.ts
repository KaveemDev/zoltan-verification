import { Router } from 'express';
import {
  cancelSchema,
  createAgreementSchema,
  extendExpirySchema,
  listAgreementsQuery,
  pdfUrlQuery,
} from '@app/shared';
import { requestContext } from '../lib/request.js';
import { requireAuth } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { logAccess } from '../services/access-log.service.js';
import {
  cancelAgreement,
  createAgreement,
  extendExpiry,
  getAgreementDetail,
  getAgreementOrThrow,
  listAgreements,
  resendLink,
} from '../services/agreement.service.js';
import { getMe } from '../services/auth.service.js';
import { pdfUrl, streamEvidenceBundle, videoUrl } from '../services/evidence.service.js';
import { verifyIntegrity } from '../services/integrity.service.js';

export const agreementsRouter = Router();
agreementsRouter.use(requireAuth, requireCsrf);

const id = (p: { id?: string | string[] }) => String(p.id);

agreementsRouter.get('/', async (req, res) => {
  res.json(await listAgreements(listAgreementsQuery.parse(req.query)));
});

agreementsRouter.post('/', async (req, res) => {
  const input = createAgreementSchema.parse(req.body);
  res.status(201).json(await createAgreement(input, req.user!.sub, requestContext(req)));
});

agreementsRouter.get('/:id', async (req, res) => {
  res.json(await getAgreementDetail(id(req.params)));
});

agreementsRouter.post('/:id/cancel', async (req, res) => {
  const { reason } = cancelSchema.parse(req.body ?? {});
  await cancelAgreement(id(req.params), reason, req.user!.sub, requestContext(req));
  res.json(await getAgreementDetail(id(req.params)));
});

agreementsRouter.post('/:id/extend', async (req, res) => {
  const { hours } = extendExpirySchema.parse(req.body);
  await extendExpiry(id(req.params), hours, req.user!.sub, requestContext(req));
  res.json(await getAgreementDetail(id(req.params)));
});

agreementsRouter.post('/:id/resend', async (req, res) => {
  const { sent } = await resendLink(id(req.params), req.user!.sub, requestContext(req));
  res.json({ sent, agreement: await getAgreementDetail(id(req.params)) });
});

agreementsRouter.get('/:id/video-url', async (req, res) => {
  const a = await getAgreementOrThrow(id(req.params));
  const url = await videoUrl(a);
  await logAccess(req.user!.sub, a.id, 'VIDEO_VIEWED', req.ip ?? null);
  res.json(url);
});

agreementsRouter.get('/:id/pdf-url', async (req, res) => {
  const { which, download } = pdfUrlQuery.parse(req.query);
  const a = await getAgreementOrThrow(id(req.params));
  const url = await pdfUrl(a, which, download === '1');
  await logAccess(
    req.user!.sub,
    a.id,
    download === '1' ? 'PDF_DOWNLOADED' : 'PDF_VIEWED',
    req.ip ?? null,
  );
  res.json(url);
});

agreementsRouter.get('/:id/evidence-bundle', async (req, res) => {
  const a = await getAgreementOrThrow(id(req.params));
  const me = (await getMe(req.user!.sub))!;
  // Logged before streaming: an aborted download still counts as an access attempt.
  await logAccess(me.id, a.id, 'BUNDLE_DOWNLOADED', req.ip ?? null);
  await streamEvidenceBundle(a, { id: me.id, name: me.name }, res);
});

agreementsRouter.post('/:id/verify-integrity', async (req, res) => {
  const a = await getAgreementOrThrow(id(req.params));
  await logAccess(req.user!.sub, a.id, 'INTEGRITY_CHECKED', req.ip ?? null);
  res.json(await verifyIntegrity(a));
});
