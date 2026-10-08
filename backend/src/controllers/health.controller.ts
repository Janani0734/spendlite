import type { Request, Response } from 'express';
import { checkDatabase } from '../services/health.service';
import { sendError, sendSuccess } from '../utils/apiResponse';

export async function getHealth(_req: Request, res: Response): Promise<void> {
  try {
    const database = await checkDatabase();
    sendSuccess(res, {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      database: { status: 'up', ...database },
    });
  } catch (error) {
    // Details go to the server log only, never to the client.
    console.error('Health check failed: database unreachable', error);
    sendError(res, 503, 'DB_UNAVAILABLE', 'Database is unreachable', {
      api: 'up',
      database: 'down',
    });
  }
}