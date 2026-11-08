import { createApp } from './app.js';
import { prisma } from './db.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { startJobs } from './services/jobs.service.js';
import { closePdfBrowser } from './services/pdf.service.js';

const server = createApp().listen(env.PORT, () => logger.info(`API listening on ${env.API_URL}`));
const stopJobs = startJobs();

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, () => {
    stopJobs();
    server.close();
    Promise.allSettled([closePdfBrowser(), prisma.$disconnect()]).then(() => process.exit(0));
  });
}
