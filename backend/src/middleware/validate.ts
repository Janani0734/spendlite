import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

// Validates req.body. On failure the ZodError goes to the central error
// handler, which turns it into a 400 VALIDATION_ERROR response.
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}