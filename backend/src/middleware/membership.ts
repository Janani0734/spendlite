import type { RequestHandler } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { getAuthUser } from '../utils/requestContext';

const companyIdSchema = z.uuid();

// Must run after requireAuth. Loads the caller's membership for :companyId.
// Non-members and malformed ids both get the same 404, so ids can't be probed.
export const requireMember = asyncHandler(async (req, _res, next) => {
  const user = getAuthUser(req);

  const companyId = companyIdSchema.safeParse(req.params['companyId']);
  if (!companyId.success) {
    throw AppError.notFound('Company not found');
  }

  const membership = await prisma.companyMember.findUnique({
    where: { companyId_userId: { companyId: companyId.data, userId: user.id } },
    select: { companyId: true, role: true },
  });
  if (!membership) {
    throw AppError.notFound('Company not found');
  }

  req.membership = membership;
  next();
});

// Must run after requireMember.
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.membership?.role !== 'ADMIN') {
    next(AppError.forbidden('Only company admins can do this'));
    return;
  }
  next();
};