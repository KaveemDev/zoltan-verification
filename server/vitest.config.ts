import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Integration tests need real Postgres + S3: run them with `npm run test:integration`.
    exclude: ['**/node_modules/**', '**/*.int.test.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'test-jwt-secret-test-jwt-secret-test-jwt-secret',
      SIGNING_SESSION_SECRET: 'test-signing-secret-test-signing-secret-xx',
      WEB_URL: 'http://localhost:5173',
      API_URL: 'http://localhost:4000',
      BUSINESS_NAME: 'Test Travel',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'test',
      S3_ACCESS_KEY: 'test',
      S3_SECRET_KEY: 'test',
    },
  },
});
