import { Router } from 'express';
import { getBudgetStatus, setBudget } from '../controllers/budget.controller';
import { requireAdmin } from '../middleware/membership';
import { validateBody } from '../middleware/validate';
import { setBudgetSchema } from '../schemas/budget.schema';
import { asyncHandler } from '../utils/asyncHandler';

// Mounted under /companies/:companyId/budgets, after requireAuth and requireMember.
export const budgetRouter = Router();

budgetRouter.put('/', requireAdmin, validateBody(setBudgetSchema), asyncHandler(setBudget));
budgetRouter.get('/status', asyncHandler(getBudgetStatus));