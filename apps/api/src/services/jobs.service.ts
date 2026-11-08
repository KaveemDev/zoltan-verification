import { spawn } from 'node:child_process';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { appendAuditEvent } from './audit.service.js';
import { deleteObject, listObjects, putObject } from './storage.service.js';

const OPEN = ['DRAFT', 'SENT', 'OPENED', 'VERIFIED'] as const;

/** Marks open agreements whose link has passed its expiry as EXPIRED. Safe to run concurrently. */
export async function expireLinks(now = new Date()) {
  const due = await prisma.agreement.findMany({
    where: { status: { in: [...OPEN] }, tokenExpiresAt: { lt: now } },
    select: { id: true },
  });
  let expired = 0;
  for (const { id } of due) {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.agreement.updateMany({
        where: { id, status: { in: [...OPEN] }, tokenExpiresAt: { lt: now } },
        data: { status: 'EXPIRED' },
      });
      if (count) {
        expired++;
        await appendAuditEvent(id, 'EXPIRED', {}, { reason: 'scheduled expiry job' }, tx);
      }
    });
  }
  return expired;
}

/**
 * Flags records whose retention period (RETENTION_YEARS after signing, or after creation if never
 * signed) has passed. Flagging deletes nothing: an admin reviews and purges deliberately.
 */
export async function flagRetention(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - env.RETENTION_YEARS);
  const { count } = await prisma.agreement.updateMany({
    where: {
      retentionDueAt: null,
      purgedAt: null,
      status: { in: ['SIGNED', 'EXPIRED', 'CANCELLED'] },
      OR: [{ signedAt: { lte: cutoff } }, { signedAt: null, createdAt: { lte: cutoff } }],
    },
    data: { retentionDueAt: now },
  });
  return count;
}

/**
 * Dumps the database (pg_dump custom format, already compressed) to backups/db-YYYY-MM-DD.dump in
 * the bucket and deletes backups older than BACKUP_RETENTION_DAYS. Restore: README → "Backups".
 * shortcut: holds the dump in memory; fine while the DB is metadata only (files live in the bucket).
 */
export async function backupDatabase(now = new Date()) {
  const url = new URL(env.DATABASE_URL);
  url.search = ''; // pg_dump rejects Prisma's ?schema= parameter
  const dump = await new Promise<Buffer>((resolve, reject) => {
    const p = spawn('pg_dump', ['--format=custom', '--no-owner', `--dbname=${url}`]);
    const out: Buffer[] = [];
    let err = '';
    p.stdout.on('data', (c: Buffer) => out.push(c));
    p.stderr.on('data', (c: Buffer) => (err += c));
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(new Error(`pg_dump exited ${code}: ${err.slice(0, 300)}`)),
    );
  });
  await putObject(
    `backups/db-${now.toISOString().slice(0, 10)}.dump`,
    dump,
    'application/octet-stream',
  );
  const cutoff = now.getTime() - env.BACKUP_RETENTION_DAYS * 86_400_000;
  for (const o of await listObjects('backups/')) {
    if (o.lastModified.getTime() < cutoff) await deleteObject(o.key);
  }
  return dump.length;
}

/** In-process scheduler. Every instance may run it: both jobs are idempotent. */
export function startJobs() {
  const run = (name: string, fn: () => Promise<number>) => () =>
    fn().then(
      (n) => n && logger.info({ job: name, count: n }, 'job done'),
      (err) => logger.error({ err, job: name }, 'job failed'),
    );
  const expire = run('expire-links', () => expireLinks());
  const retention = run('flag-retention', () => flagRetention());
  expire();
  retention();
  const timers = [setInterval(expire, 15 * 60_000), setInterval(retention, 24 * 60 * 60_000)];
  if (env.DB_BACKUPS === 'on') {
    const backup = run('db-backup', () => backupDatabase());
    backup();
    timers.push(setInterval(backup, 24 * 60 * 60_000));
  }
  timers.forEach((t) => t.unref());
  return () => timers.forEach(clearInterval);
}
