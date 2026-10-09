import { Router } from 'express';
import {
  createCompany,
  deleteCompany,
  getCompany,
  listCompanies,
  listMembers,
} from '../controllers/company.controller';
import { createInvite } from '../controllers/invite.controller';
import { requireAuth } from '../middleware/auth';
import { requireAdmin, requireMember } from '../middleware/membership';
import { validateBody } from '../middleware/validate';
import { createCompanySchema } from '../schemas/company.schema';
import { createInviteSchema } from '../schemas/invite.schema';
import { asyncHandler } from '../utils/asyncHandler';

export const companyRouter = Router();

companyRouter.use(requireAuth);

companyRouter.post('/', validateBody(createCompanySchema), asyncHandler(createCompany));
companyRouter.get('/', asyncHandler(listCompanies));
companyRouter.get('/:companyId', requireMember, asyncHandler(getCompany));
companyRouter.delete('/:companyId', requireMember, requireAdmin, asyncHandler(deleteCompany));
companyRouter.get('/:companyId/members', requireMember, asyncHandler(listMembers));
companyRouter.post(
  '/:companyId/invites',
  requireMember,
  requireAdmin,
  validateBody(createInviteSchema),
  asyncHandler(createInvite),
);