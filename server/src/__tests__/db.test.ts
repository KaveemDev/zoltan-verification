import { Prisma } from '@prisma/client';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { withPoolDefaults } from '../db.js';
import { isDbUnavailable, isRetryable } from '../dbErrors.js';
import { errorHandler } from '../middleware/error.js';

const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'test' });

describe('withPoolDefaults', () => {
  it('adds pool params and keeps ones already set, and the password', () => {
    const url = new URL(withPoolDefaults('mysql://u:p%40ss@h:3306/db?connection_limit=2'));
    expect(url.password).toBe('p%40ss');
    expect(url.searchParams.get('connection_limit')).toBe('2');
    expect(url.searchParams.get('max_idle_connection_lifetime')).toBe('10');
  });
});

describe('db error helpers', () => {
  it('retries only errors where the query never ran', () => {
    expect(isRetryable(known('P1001'))).toBe(true);
    expect(isRetryable(known('P1017'))).toBe(false);
    expect(isRetryable(known('P2002'))).toBe(false);
    expect(isRetryable(new Error('P1001'))).toBe(false);
    expect(isRetryable(new Prisma.PrismaClientInitializationError("Can't reach", 'test'))).toBe(true);
    expect(isRetryable(new Prisma.PrismaClientInitializationError('auth', 'test', 'P1000'))).toBe(false);
  });

  it('answers 503 when the database is unreachable', async () => {
    expect(isDbUnavailable(known('P1017'))).toBe(true);
    const app = express();
    app.get('/', () => {
      throw known('P1001');
    });
    app.use(errorHandler);
    const res = await request(app).get('/');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('DB_UNAVAILABLE');
  });
});
