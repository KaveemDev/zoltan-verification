import { defineConfig } from 'vitest/config';

/** Runs against the real services from docker-compose, using the repo-root .env. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.int.test.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
