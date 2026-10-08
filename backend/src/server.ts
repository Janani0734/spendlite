import { createApp } from './app';
import { prisma } from './config/db';
import { env } from './config/env';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`SpendLite API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(`Failed to start server: ${error.message}`);
  process.exit(1);
});

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down...`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  // Force exit if connections refuse to drain.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));