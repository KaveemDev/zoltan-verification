import { Prisma } from '@prisma/client';

// No connection was made, so the query never ran: safe to retry, writes included.
const NOT_CONNECTED = new Set(['P1001', 'P2024']);
// The database is unreachable right now: answer 503, not 500.
const UNAVAILABLE = new Set([...NOT_CONNECTED, 'P1002', 'P1008', 'P1017']);

// A failed first connect comes back as an InitializationError, often with no code: treat as P1001.
export const dbErrorCode = (e: unknown): string | undefined =>
  e instanceof Prisma.PrismaClientKnownRequestError
    ? e.code
    : e instanceof Prisma.PrismaClientInitializationError
      ? (e.errorCode ?? 'P1001')
      : undefined;

export const isRetryable = (e: unknown) => NOT_CONNECTED.has(dbErrorCode(e) ?? '');
export const isDbUnavailable = (e: unknown) => UNAVAILABLE.has(dbErrorCode(e) ?? '');
