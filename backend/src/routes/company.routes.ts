import { Router } from 'express';
import { createCompany, getCompany, listCompanies } from '../controllers/company.controller';
import { requireAuth } from '../middleware/auth';
import { requireMember } from '../middleware/membership';
import { validateBody } from '../middleware/validate';
import { createCompanySchema } from '../schemas/company.schema';
import { asyncHandler } from '../utils/asyncHandler';

export const companyRouter = Router();

companyRouter.use(requireAuth);

companyRouter.post('/', validateBody(createCompanySchema), asyncHandler(createCompany));
companyRouter.get('/', asyncHandler(listCompanies));
companyRouter.get('/:companyId', requireMember, asyncHandler(getCompany));