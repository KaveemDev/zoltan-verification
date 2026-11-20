import type { ErrorRequestHandler } from 'express';
import { ZodError, z } from 'zod';
import { isDbUnavailable } from '../dbErrors.js';
import { HttpError } from '../errors.js';
import { logger } from '../logger.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'VALIDATION', fields: z.flattenError(err).fieldErrors });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ ...err.extra, error: err.code, message: err.message });
    return;
  }
  if (isDbUnavailable(err)) {
    logger.error({ err }, 'database unavailable');
    res.status(503).json({
      error: 'DB_UNAVAILABLE',
      message: "Can't reach the database right now. Please try again in a minute.",
    });
    return;
  }
  logger.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'INTERNAL', message: 'Something went wrong' });
};
