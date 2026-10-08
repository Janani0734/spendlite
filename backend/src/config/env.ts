import path from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

// Load .env from backend/ or the repo root. Variables already set in the
// process (Docker, CI, hosting) always win over file values.
config({
  path: [path.resolve(__dirname, '../../.env'), path.resolve(__dirname, '../../../.env')],
  quiet: true,
});

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
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  process.exit(1);
}

export const env = result.data;
export type Env = typeof env;