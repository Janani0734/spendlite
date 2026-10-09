import type { Request, Response } from 'express';
import { budgetStatusQuerySchema, type SetBudgetInput } from '../schemas/budget.schema';
import * as budgetService from '../services/budget.service';
import { sendSuccess } from '../utils/apiResponse';
import { resolvePeriod } from '../utils/period';
import { getMembership } from '../utils/requestContext';

export async function setBudget(req: Request, res: Response): Promise<void> {
  const membership = getMembership(req);
  const budget = await budgetService.setBudget(membership.companyId, req.body as SetBudgetInput);
  sendSuccess(res, { budget });
}

export async function getBudgetStatus(req: Request, res: Response): Promise<void> {
  const membership = getMembership(req);
  // A ZodError thrown here becomes a 400 VALIDATION_ERROR via the error handler.
  const query = budgetStatusQuerySchema.parse(req.query);
  const { year, month } = resolvePeriod(query);

  const report = await budgetService.getBudgetStatus(membership.companyId, year, month);
  sendSuccess(res, report);
}