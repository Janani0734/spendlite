import { prisma } from '../config/db';
import type { ExpenseCategory } from '../generated/prisma/enums';
import { formatCents, toCents } from '../utils/money';
import { monthRange, previousMonth, type Period } from '../utils/period';

export interface CategorySpend {
  category: ExpenseCategory;
  total: string;
  count: number;
  percentOfTotal: number;
}

export interface DashboardSummary {
  period: Period;
  totalSpend: string;
  expenseCount: number;
  averageExpense: string | null;
  byCategory: CategorySpend[];
}

export interface TopCategory extends CategorySpend {
  rank: number;
  previousMonthTotal: string;
  changePercent: number | null;
}

export interface TopCategoriesReport {
  period: Period;
  totalSpend: string;
  topCategories: TopCategory[];
}

export interface ReviewExpense {
  id: string;
  amount: string;
  category: ExpenseCategory;
  date: string;
  description: string;
  merchant: string | null;
  createdBy: { id: string; name: string };
  timesCategoryAverage: number | null;
}

export interface ReviewReport {
  period: Period;
  threshold: string;
  flaggedTotal: number;
  expenses: ReviewExpense[];
}

interface SummaryRow {
  category: string | null;
  total: string;
  cnt: number;
  average: string | null;
}

interface TopRow {
  rnk: number;
  category: string;
  total: string;
  cnt: number;
  previous_total: string | null;
  grand_total: string;
}

interface ReviewRow {
  id: string;
  amount: string;
  category: string;
  date: string;
  description: string;
  merchant: string | null;
  created_by_id: string;
  created_by_name: string;
  times_average: string | null;
  flagged_total: number;
}

// Share of the whole, to one decimal place, from integer paise.
function percentOf(partCents: number, wholeCents: number): number {
  return wholeCents === 0 ? 0 : Math.round((partCents * 1000) / wholeCents) / 10;
}

// Query 1: monthly spend per category, plus the grand total, count, and average in
// the same pass. GROUP BY ROLLUP adds one extra row (category NULL) holding the totals.
export async function getDashboard(companyId: string, period: Period): Promise<DashboardSummary> {
  const { start, end } = monthRange(period.year, period.month);

  const rows = await prisma.$queryRaw<SummaryRow[]>`
    SELECT
      category::text AS category,
      COALESCE(SUM(amount), 0)::text AS total,
      COUNT(*)::int AS cnt,
      ROUND(AVG(amount), 2)::text AS average
    FROM expenses
    WHERE company_id = ${companyId}::uuid
      AND date >= ${start}::date
      AND date < ${end}::date
    GROUP BY ROLLUP (category)
    ORDER BY category IS NULL, SUM(amount) DESC, category
  `;

  const overall = rows.find((row) => row.category === null);
  const totalCents = toCents(overall?.total ?? '0');

  const byCategory = rows
    .filter((row) => row.category !== null)
    .map((row) => {
      const cents = toCents(row.total);
      return {
        category: row.category as ExpenseCategory,
        total: formatCents(cents),
        count: row.cnt,
        percentOfTotal: percentOf(cents, totalCents),
      };
    });

  return {
    period,
    totalSpend: formatCents(totalCents),
    expenseCount: overall?.cnt ?? 0,
    averageExpense: overall?.average ? formatCents(toCents(overall.average)) : null,
    byCategory,
  };
}

// Query 2: top N categories by spend, ranked with a window function, each compared
// with the previous month. The grand total is a window SUM, so shares stay relative
// to all spend even though LIMIT trims the rows.
export async function getTopCategories(
  companyId: string,
  period: Period,
  limit: number,
): Promise<TopCategoriesReport> {
  const { start, end } = monthRange(period.year, period.month);
  const previous = previousMonth(period);
  const { start: previousStart } = monthRange(previous.year, previous.month);

  const rows = await prisma.$queryRaw<TopRow[]>`
    WITH this_month AS (
      SELECT category, SUM(amount) AS total, COUNT(*) AS cnt
      FROM expenses
      WHERE company_id = ${companyId}::uuid
        AND date >= ${start}::date
        AND date < ${end}::date
      GROUP BY category
    ),
    last_month AS (
      SELECT category, SUM(amount) AS total
      FROM expenses
      WHERE company_id = ${companyId}::uuid
        AND date >= ${previousStart}::date
        AND date < ${start}::date
      GROUP BY category
    )
    SELECT
      (ROW_NUMBER() OVER (ORDER BY t.total DESC, t.category))::int AS rnk,
      t.category::text AS category,
      t.total::text AS total,
      t.cnt::int AS cnt,
      l.total::text AS previous_total,
      (SUM(t.total) OVER ())::text AS grand_total
    FROM this_month t
    LEFT JOIN last_month l ON l.category = t.category
    ORDER BY t.total DESC, t.category
    LIMIT ${limit}::int
  `;

  const grandCents = toCents(rows[0]?.grand_total ?? '0');

  return {
    period,
    totalSpend: formatCents(grandCents),
    topCategories: rows.map((row) => {
      const cents = toCents(row.total);
      const previousCents = row.previous_total === null ? 0 : toCents(row.previous_total);
      return {
        rank: row.rnk,
        category: row.category as ExpenseCategory,
        total: formatCents(cents),
        count: row.cnt,
        percentOfTotal: percentOf(cents, grandCents),
        previousMonthTotal: formatCents(previousCents),
        // No baseline when the category had no spend last month.
        changePercent:
          previousCents === 0
            ? null
            : Math.round(((cents - previousCents) * 1000) / previousCents) / 10,
      };
    }),
  };
}

// Query 3: expenses at or above a threshold. The window AVG is computed over the whole
// month's category (in the CTE) before the outer WHERE filters, so "times average"
// compares each flagged expense with everything the category spent that month.
export async function getReviewExpenses(
  companyId: string,
  period: Period,
  threshold: string,
  limit: number,
): Promise<ReviewReport> {
  const { start, end } = monthRange(period.year, period.month);

  const rows = await prisma.$queryRaw<ReviewRow[]>`
    WITH month_expenses AS (
      SELECT
        e.id,
        e.amount,
        e.category,
        e.date,
        e.description,
        e.merchant,
        e.created_by_id,
        AVG(e.amount) OVER (PARTITION BY e.category) AS category_avg
      FROM expenses e
      WHERE e.company_id = ${companyId}::uuid
        AND e.date >= ${start}::date
        AND e.date < ${end}::date
    )
    SELECT
      m.id::text AS id,
      m.amount::text AS amount,
      m.category::text AS category,
      to_char(m.date, 'YYYY-MM-DD') AS date,
      m.description AS description,
      m.merchant AS merchant,
      m.created_by_id::text AS created_by_id,
      u.name AS created_by_name,
      ROUND(m.amount / NULLIF(m.category_avg, 0), 1)::text AS times_average,
      (COUNT(*) OVER ())::int AS flagged_total
    FROM month_expenses m
    JOIN users u ON u.id = m.created_by_id
    WHERE m.amount >= ${threshold}::numeric
    ORDER BY m.amount DESC, m.id DESC
    LIMIT ${limit}::int
  `;

  return {
    period,
    threshold: formatCents(toCents(threshold)),
    flaggedTotal: rows[0]?.flagged_total ?? 0,
    expenses: rows.map((row) => ({
      id: row.id,
      amount: formatCents(toCents(row.amount)),
      category: row.category as ExpenseCategory,
      date: row.date,
      description: row.description,
      merchant: row.merchant,
      createdBy: { id: row.created_by_id, name: row.created_by_name },
      timesCategoryAverage: row.times_average === null ? null : Number(row.times_average),
    })),
  };
}