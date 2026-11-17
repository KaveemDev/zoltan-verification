import { createHash } from 'node:crypto';
import { createApp } from './app.js';
import { prisma } from './db.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { getEmail } from './messaging/index.js';
import { ZeptoMailProvider } from './messaging/zeptomail.provider.js';
import { startJobs } from './services/jobs.service.js';

const server = createApp().listen(env.PORT, () => logger.info(`API listening on ${env.API_URL}`));
const stopJobs = startJobs();

// Say at boot whether email will work. The fingerprint shows WHICH key this process loaded
// (pm2 can keep an old one in its saved environment, which wins over .env), without revealing it.
const email = getEmail();
if (email instanceof ZeptoMailProvider) {
  const fingerprint = createHash('sha256')
    .update((env.ZEPTOMAIL_API_KEY ?? '').replace(/^Zoho-enczapikey\s+/i, '').trim())
    .digest('hex')
    .slice(0, 8);
  email
    .checkKey()
    .then(({ ok, detail }) =>
      (ok ? logger.info : logger.error).call(
        logger,
        { host: env.ZEPTOMAIL_API_HOST, from: env.EMAIL_FROM, keyFingerprint: fingerprint, detail },
        ok ? 'ZeptoMail key accepted' : 'ZeptoMail key REJECTED: emails and codes will not send',
      ),
    )
    .catch((err) => logger.error({ err: (err as Error).message }, 'ZeptoMail key check failed'));
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, () => {
    stopJobs();
    server.close();
    Promise.allSettled([prisma.$disconnect()]).then(() => process.exit(0));
  });
}
