import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  // Defence in depth: never log secrets even if someone logs a whole request.
  redact: [
    'req.headers.cookie',
    'req.headers.authorization',
    '*.password',
    '*.otp',
    '*.token',
    '*.url',
  ],
});
