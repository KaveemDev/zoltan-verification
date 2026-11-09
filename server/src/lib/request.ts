import type { Request } from 'express';
import { deviceInfoSchema } from '../shared/index.js';
import type { RequestContext } from '../services/audit.service.js';

function deviceInfo(req: Request) {
  const raw = req.get('x-device-info');
  if (!raw || raw.length > 1024) return null;
  try {
    const parsed = deviceInfoSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const requestContext = (req: Request): RequestContext => ({
  ip: req.ip ?? null,
  userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
  deviceInfo: deviceInfo(req),
});
