import { PrismaClient } from '@prisma/client';
import { dbErrorCode, isRetryable } from './dbErrors.js';
import { env } from './env.js';
import { logger } from './logger.js';

// The shared MySQL host silently drops idle sockets. Like Sequelize's pool (what zoltan-travels
// uses), close idle connections after 10s and time out instead of hanging. Params already in
// DATABASE_URL win.
const POOL_DEFAULTS = {
  connection_limit: '5',
  max_idle_connection_lifetime: '10',
  connect_timeout: '10',
  pool_timeout: '10',
  socket_timeout: '30',
};

export function withPoolDefaults(raw: string): string {
  const url = new URL(raw);
  for (const [key, value] of Object.entries(POOL_DEFAULTS)) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return url.toString();
}

const MAX_ATTEMPTS = 3;

// The cast is safe: a query-only extension leaves every model type unchanged, and services pass
// `prisma` where a TransactionClient is expected.
export const prisma = new PrismaClient({
  datasourceUrl: withPoolDefaults(env.DATABASE_URL),
}).$extends({
  query: {
    async $allOperations({ model, operation, args, query }) {
      for (let attempt = 1; ; attempt++) {
        try {
          return await query(args);
        } catch (e) {
          if (attempt >= MAX_ATTEMPTS || !isRetryable(e)) throw e;
          logger.warn({ model, operation, attempt, code: dbErrorCode(e) }, 'database unreachable, retrying');
          await new Promise((r) => setTimeout(r, attempt * 500));
        }
      }
    },
  },
}) as unknown as PrismaClient;
