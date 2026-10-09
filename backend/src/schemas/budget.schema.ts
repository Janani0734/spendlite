import { z } from 'zod';
import { category, positiveAmount } from './expense.schema';

export const setBudgetSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  // Omit or send null for the company-wide monthly budget.
  category: category.nullable().optional(),
  amount: positiveAmount,
});

export const budgetStatusQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export type SetBudgetInput = z.infer<typeof setBudgetSchema>;
export type BudgetStatusQuery = z.infer<typeof budgetStatusQuerySchema>;