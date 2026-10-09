import { prisma } from '../config/db';
import type { ExpenseCategory } from '../generated/prisma/enums';
import type { SetBudgetInput } from '../schemas/budget.schema';
import { formatCents, toCents } from '../utils/money';

export type BudgetStatus = 'NO_BUDGET' | 'OK' | 'WARNING' | 'OVER_BUDGET';

export interface BudgetView {
  id: string;
  year: number;
  month: number;
  category: ExpenseCategory | null;
  amount: string;
}

export interface BudgetLine {
  budget: string | null;
  spent: string;
  remaining: string | null;
  percentUsed: number | null;
  status: BudgetStatus;
}

export interface BudgetStatusReport {
  period: { year: number; month: number };
  overall: BudgetLine;
  categories: (BudgetLine & { category: ExpenseCategory })[];
}

interface StatusRow {
  category: string | null;
  budget: string | null;
  spent: string;
}

// Creates the budget or updates its amount. Raw SQL because Prisma's upsert cannot
// target a unique key whose "category" column is NULL for the overall budget; the
// NULLS NOT DISTINCT unique index from the migration makes ON CONFLICT work for it.
export async function setBudget(companyId: string, input: SetBudgetInput): Promise<BudgetView> {
  const rows = await prisma.$queryRaw<BudgetView[]>`
    INSERT INTO budgets (company_id, year, month, category, amount, updated_at)
    VALUES (
      ${companyId}::uuid,
      ${input.year}::int,
      ${input.month}::int,
      ${input.category ?? null}::expense_category,
      ${input.amount}::numeric,
      now()
    )
    ON CONFLICT (company_id, year, month, category)
    DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()
    RETURNING
      id::text AS id,
      year::int AS year,
      month::int AS month,
      category::text AS category,
      amount::text AS amount
  `;
  const budget = rows[0];
  if (!budget) {
    throw new Error('Budget upsert returned no row');
  }
  return budget;
}

function monthRange(year: number, month: number): { start: string; end: string } {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return { start: `${year}-${pad(month)}-01`, end: `${nextYear}-${pad(nextMonth)}-01` };
}

function buildLine(budgetText: string | null, spentText: string): BudgetLine {
  const spentCents = toCents(spentText);
  if (budgetText === null) {
    return {
      budget: null,
      spent: formatCents(spentCents),
      remaining: null,
      percentUsed: null,
      status: 'NO_BUDGET',
    };
  }

  const budgetCents = toCents(budgetText);
  // Exact integer comparisons, so 80% and 100% have no floating-point edge cases.
  let status: BudgetStatus = 'OK';
  if (spentCents > budgetCents) {
    status = 'OVER_BUDGET';
  } else if (spentCents * 100 > budgetCents * 80) {
    status = 'WARNING';
  }

  return {
    budget: formatCents(budgetCents),
    spent: formatCents(spentCents),
    remaining: formatCents(budgetCents - spentCents),
    percentUsed: Math.round((spentCents * 1000) / budgetCents) / 10,
    status,
  };
}

// One query: the overall row (category NULL) plus one row per category, each joined
// to that month's spend and its budget, if any.
export async function getBudgetStatus(
  companyId: string,
  year: number,
  month: number,
): Promise<BudgetStatusReport> {
  const { start, end } = monthRange(year, month);

  const rows = await prisma.$queryRaw<StatusRow[]>`
    WITH spend AS (
      SELECT category, SUM(amount) AS spent
      FROM expenses
      WHERE company_id = ${companyId}::uuid
        AND date >= ${start}::date
        AND date < ${end}::date
      GROUP BY category
    ),
    lines AS (
      SELECT NULL::expense_category AS category
      UNION ALL
      SELECT unnest(enum_range(NULL::expense_category))
    )
    SELECT
      l.category::text AS category,
      b.amount::text AS budget,
      (CASE
         WHEN l.category IS NULL THEN (SELECT COALESCE(SUM(spent), 0) FROM spend)
         ELSE COALESCE(s.spent, 0)
       END)::text AS spent
    FROM lines l
    LEFT JOIN spend s ON s.category = l.category
    LEFT JOIN budgets b
      ON b.company_id = ${companyId}::uuid
     AND b.year = ${year}::int
     AND b.month = ${month}::int
     AND b.category IS NOT DISTINCT FROM l.category
    ORDER BY l.category NULLS FIRST
  `;

  const overallRow = rows.find((row) => row.category === null);
  const categoryRows = rows.filter((row) => row.category !== null);

  return {
    period: { year, month },
    overall: buildLine(overallRow?.budget ?? null, overallRow?.spent ?? '0'),
    categories: categoryRows.map((row) => ({
      // Safe cast: the values come from the database enum itself.
      category: row.category as ExpenseCategory,
      ...buildLine(row.budget, row.spent),
    })),
  };
}