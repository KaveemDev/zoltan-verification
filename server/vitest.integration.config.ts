import { defineConfig } from 'vitest/config';

/** Runs against a real MySQL and S3-compatible storage (MinIO locally), using server/.env. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.int.test.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
