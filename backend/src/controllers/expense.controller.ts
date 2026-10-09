import type { Request, Response } from 'express';
import {
  listExpensesQuerySchema,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from '../schemas/expense.schema';
import * as expenseService from '../services/expense.service';
import { sendSuccess } from '../utils/apiResponse';
import { getAuthUser, getMembership, getUuidParam } from '../utils/requestContext';

function callerFrom(req: Request): { userId: string; role: 'ADMIN' | 'MEMBER'; companyId: string } {
  const user = getAuthUser(req);
  const membership = getMembership(req);
  return { userId: user.id, role: membership.role, companyId: membership.companyId };
}

export async function createExpense(req: Request, res: Response): Promise<void> {
  const { userId, companyId } = callerFrom(req);
  const expense = await expenseService.createExpense(
    companyId,
    userId,
    req.body as CreateExpenseInput,
  );
  sendSuccess(res, { expense }, 201);
}

export async function listExpenses(req: Request, res: Response): Promise<void> {
  const { companyId } = callerFrom(req);
  // A ZodError thrown here becomes a 400 VALIDATION_ERROR via the error handler.
  const query = listExpensesQuerySchema.parse(req.query);
  const result = await expenseService.listExpenses(companyId, query);
  sendSuccess(res, result);
}

export async function getExpense(req: Request, res: Response): Promise<void> {
  const { companyId } = callerFrom(req);
  const expenseId = getUuidParam(req, 'expenseId', 'Expense');
  const expense = await expenseService.getExpense(companyId, expenseId);
  sendSuccess(res, { expense });
}

export async function updateExpense(req: Request, res: Response): Promise<void> {
  const { userId, role, companyId } = callerFrom(req);
  const expenseId = getUuidParam(req, 'expenseId', 'Expense');
  const expense = await expenseService.updateExpense(
    companyId,
    expenseId,
    { userId, role },
    req.body as UpdateExpenseInput,
  );
  sendSuccess(res, { expense });
}

export async function deleteExpense(req: Request, res: Response): Promise<void> {
  const { userId, role, companyId } = callerFrom(req);
  const expenseId = getUuidParam(req, 'expenseId', 'Expense');
  await expenseService.deleteExpense(companyId, expenseId, { userId, role });
  sendSuccess(res, { deleted: true });
}