import { prisma } from '../config/db';

export async function checkDatabase(): Promise<{ latencyMs: number }> {
  const startedAt = process.hrtime.bigint();
  await prisma.$queryRaw`SELECT 1`;
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  return { latencyMs: Number(elapsedMs.toFixed(2)) };
}