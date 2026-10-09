import { execSync } from 'node:child_process';

function databaseName(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
  } catch {
    return '';
  }
}

// Runs once before all tests: apply migrations to the test database.
export default function setup(): void {
  const name = databaseName();
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run tests against database "${name}". The name must end in "_test".`);
  }
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
}