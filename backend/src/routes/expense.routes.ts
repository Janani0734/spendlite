import { Router } from 'express';
import {
  createExpense,
  deleteExpense,
  getExpense,
  listExpenses,
  updateExpense,
} from '../controllers/expense.controller';
import { validateBody } from '../middleware/validate';
import { createExpenseSchema, updateExpenseSchema } from '../schemas/expense.schema';
import { asyncHandler } from '../utils/asyncHandler';

// Mounted under /companies/:companyId/expenses, after requireAuth and requireMember.
export const expenseRouter = Router();

expenseRouter.post('/', validateBody(createExpenseSchema), asyncHandler(createExpense));
expenseRouter.get('/', asyncHandler(listExpenses));
expenseRouter.get('/:expenseId', asyncHandler(getExpense));
expenseRouter.patch('/:expenseId', validateBody(updateExpenseSchema), asyncHandler(updateExpense));
expenseRouter.delete('/:expenseId', asyncHandler(deleteExpense));