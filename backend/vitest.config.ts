import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Same lookup order as src/config/env.ts: backend/.env, then the repo root .env.
config({
  path: [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../.env')],
  quiet: true,
});

// Tests always run against a dedicated database whose name ends in "_test".
function resolveTestDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit) {
    return explicit;
  }
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error('Set DATABASE_URL (or TEST_DATABASE_URL) to run the tests');
  }
  const url = new URL(base);
  if (!url.pathname.endsWith('_test')) {
    url.pathname = `${url.pathname}_test`;
  }
  return url.toString();
}

// Set before any test code loads, so every module sees the test database.
process.env.DATABASE_URL = resolveTestDatabaseUrl();

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/globalSetup.ts'],
    setupFiles: ['./tests/setup.ts'],
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
      JWT_EXPIRES_IN_SECONDS: '3600',
      BCRYPT_ROUNDS: '4',
            // Tests never use a real LLM: fetch is mocked, and these values are fake.
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'http://llm.test/v1',
      LLM_MODEL: 'test-model',
      LLM_TIMEOUT_MS: '5000',
    },
  },
});