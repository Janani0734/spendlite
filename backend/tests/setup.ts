import { afterAll } from 'vitest';
import { prisma } from '../src/config/db';

// Second safety net: every test file re-checks it is not pointed at the dev database.
const name = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid').pathname.slice(1);
if (!name.endsWith('_test')) {
  throw new Error(`Refusing to run tests against database "${name}".`);
}

afterAll(async () => {
  await prisma.$disconnect();
});