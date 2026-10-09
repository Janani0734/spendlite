import { Router } from 'express';
import { autoCategorize } from '../controllers/ai.controller';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { autoCategorizeSchema } from '../schemas/ai.schema';
import { asyncHandler } from '../utils/asyncHandler';

// Mounted at /api/expenses. Needs a login but no company: it only classifies text.
export const expenseAiRouter = Router();

expenseAiRouter.post(
  '/auto-categorize',
  requireAuth,
  validateBody(autoCategorizeSchema),
  asyncHandler(autoCategorize),
);