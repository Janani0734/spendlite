import type { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { env } from '../config/env';
import { sendError } from '../utils/apiResponse';
import { AppError } from '../utils/AppError';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// body-parser tags its errors with a string `type` (e.g. "entity.parse.failed").
function getErrorType(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'type' in err && typeof err.type === 'string') {
    return err.type;
  }
  return undefined;
}

// Express identifies error middleware by its four parameters; keep all four.
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  if (err instanceof ZodError) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', z.flattenError(err));
    return;
  }

  const type = getErrorType(err);
  if (type === 'entity.parse.failed') {
    sendError(res, 400, 'INVALID_JSON', 'Request body contains invalid JSON');
    return;
  }
  if (type === 'entity.too.large') {
    sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    return;
  }

  if (env.NODE_ENV !== 'test') {
    console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  }
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
}