import path from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

// Load .env from backend/ or the repo root. Variables already set in the
// process (Docker, CI, hosting) always win over file values.
config({
  path: [path.resolve(__dirname, '../../.env'), path.resolve(__dirname, '../../../.env')],
  quiet: true,
});

// An empty value in .env (for example "LLM_API_KEY=") counts as "not set".
const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine(
      (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
      'DATABASE_URL must be a PostgreSQL connection string',
    ),
  // Comma-separated list of allowed browser origins.
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(604800),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  // AI features are optional: without LLM_API_KEY and LLM_MODEL the AI endpoints
  // answer 503 and everything else works normally.
  LLM_API_KEY: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  LLM_BASE_URL: z.preprocess(emptyToUndefined, z.url().default('https://api.openai.com/v1')),
  LLM_MODEL: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  process.exit(1);
}

if (result.data.NODE_ENV === 'production' && result.data.JWT_SECRET.startsWith('replace_with')) {
  console.error('JWT_SECRET is still the example placeholder. Set a real random secret.');
  process.exit(1);
}

export const env = result.data;
export type Env = typeof env;