import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (12+ chars) in .env');
  }

  // Never overwrites an existing admin's password.
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Admin',
      role: 'ADMIN',
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    },
  });

  const bodyHtml = await readFile(
    new URL('../templates/default-agreement.html', import.meta.url),
    'utf8',
  );
  await prisma.agreementTemplate.upsert({
    where: { name_version: { name: 'Visa Assistance Agreement', version: 1 } },
    update: {},
    create: { name: 'Visa Assistance Agreement', version: 1, bodyHtml },
  });

  console.log(`Seeded admin ${email} and default template.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
