import { z } from 'zod';

export const EXPENSE_CATEGORIES = [
  'TRAVEL',
  'FOOD',
  'SOFTWARE',
  'OFFICE',
  'MARKETING',
  'OTHER',
] as const;

// MVP is INR-only: totals and budgets add amounts together, which is only
// meaningful in one currency. Multi-currency is a listed future improvement.
export const SUPPORTED_CURRENCIES = ['INR'] as const;

const category = z.string().trim().toUpperCase().pipe(z.enum(EXPENSE_CATEGORIES));
const currency = z.string().trim().toUpperCase().pipe(z.enum(SUPPORTED_CURRENCIES));

// Accepts 450, 450.5 or "450.50": up to 10 integer digits and 2 decimals (Decimal(12,2)).
const amountText = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .pipe(
    z
      .string()
      .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Amount must be a number with at most 2 decimal places'),
  );

const positiveAmount = amountText.refine(
  (value) => Number(value) > 0,
  'Amount must be greater than zero',
);

function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// "YYYY-MM-DD" in, a UTC-midnight Date out (matches the Postgres DATE column).
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine(isRealDate, 'Date is not a real calendar date')
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

const description = z.string().trim().min(1, 'Description is required').max(500);

// null clears the field on update; an empty string is treated as null.
const merchant = z
  .string()
  .trim()
  .max(100)
  .transform((value) => (value === '' ? null : value))
  .nullable();

const receiptUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => /^https?:\/\//i.test(value), 'Receipt URL must start with http:// or https://')
  .nullable();

export const createExpenseSchema = z.object({
  amount: positiveAmount,
  currency: currency.default('INR'),
  category,
  date: isoDate,
  description,
  merchant: merchant.optional(),
  receiptUrl: receiptUrl.optional(),
});

export const updateExpenseSchema = z
  .object({
    amount: positiveAmount.optional(),
    currency: currency.optional(),
    category: category.optional(),
    date: isoDate.optional(),
    description: description.optional(),
    merchant: merchant.optional(),
    receiptUrl: receiptUrl.optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    'Provide at least one field to update',
  );

export const listExpensesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
    category: category.optional(),
    date_from: isoDate.optional(),
    date_to: isoDate.optional(),
    min_amount: amountText.optional(),
    max_amount: amountText.optional(),
  })
  .refine(
    (query) =>
      query.date_from === undefined ||
      query.date_to === undefined ||
      query.date_from.getTime() <= query.date_to.getTime(),
    { message: 'date_from must not be after date_to', path: ['date_from'] },
  )
  .refine(
    (query) =>
      query.min_amount === undefined ||
      query.max_amount === undefined ||
      Number(query.min_amount) <= Number(query.max_amount),
    { message: 'min_amount must not be greater than max_amount', path: ['min_amount'] },
  );

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;