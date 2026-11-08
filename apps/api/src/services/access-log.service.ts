import {
  accessLogQuery,
  type AccessLogItem,
  type AccessLogQuery,
  type Paginated,
} from '@app/shared';
import { prisma } from '../db.js';

export type AccessAction =
  | 'VIDEO_VIEWED'
  | 'PDF_VIEWED'
  | 'PDF_DOWNLOADED'
  | 'BUNDLE_DOWNLOADED'
  | 'INTEGRITY_CHECKED'
  | 'PURGED';

export function logAccess(
  userId: string,
  agreementId: string,
  action: AccessAction,
  ip: string | null,
) {
  return prisma.accessLog.create({ data: { userId, agreementId, action, ip } });
}

export async function listAccessLog(raw: AccessLogQuery): Promise<Paginated<AccessLogItem>> {
  const { agreementId, userId, page, pageSize } = accessLogQuery.parse(raw);
  const where = { ...(agreementId && { agreementId }), ...(userId && { userId }) };
  const [rows, total] = await Promise.all([
    prisma.accessLog.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.accessLog.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      user: r.user,
      agreementId: r.agreementId,
      action: r.action,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}
