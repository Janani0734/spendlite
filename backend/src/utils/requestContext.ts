import type { Request } from 'express';
import { z } from 'zod';
import { AppError } from './AppError';

const uuidSchema = z.uuid();

// Typed accessors so handlers never need non-null assertions.
export function getAuthUser(req: Request): NonNullable<Request['user']> {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  return req.user;
}

export function getMembership(req: Request): NonNullable<Request['membership']> {
  if (!req.membership) {
    throw AppError.notFound('Company not found');
  }
  return req.membership;
}

// Reads a UUID route parameter. A malformed id is reported as "not found".
export function getUuidParam(req: Request, name: string, label: string): string {
  const parsed = uuidSchema.safeParse(req.params[name]);
  if (!parsed.success) {
    throw AppError.notFound(`${label} not found`);
  }
  return parsed.data;
}