import { z } from 'zod';
import { positiveAmount } from './expense.schema';

const periodShape = {
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
};

export const dashboardQuerySchema = z.object(periodShape);

export const topCategoriesQuerySchema = z.object({
  ...periodShape,
  limit: z.coerce.number().int().min(1).max(6).default(3),
});

export const reviewQuerySchema = z.object({
  ...periodShape,
  threshold: positiveAmount.default('10000.00'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});