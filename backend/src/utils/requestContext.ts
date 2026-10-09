import type { Request } from 'express';
import { AppError } from './AppError';

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