import { prisma } from '../config/db';
import type { ExpenseCategory, Role } from '../generated/prisma/enums';
import type {
  CreateExpenseInput,
  ListExpensesQuery,
  UpdateExpenseInput,
} from '../schemas/expense.schema';
import { AppError } from '../utils/AppError';

const expenseSelect = {
  id: true,
  amount: true,
  currency: true,
  category: true,
  date: true,
  description: true,
  merchant: true,
  receiptUrl: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
} as const;

interface ExpenseRow {
  id: string;
  amount: { toFixed(decimalPlaces: number): string };
  currency: string;
  category: ExpenseCategory;
  date: Date;
  description: string;
  merchant: string | null;
  receiptUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string };
}

export interface ExpenseView {
  id: string;
  amount: string;
  currency: string;
  category: ExpenseCategory;
  date: string;
  description: string;
  merchant: string | null;
  receiptUrl: string | null;
  createdBy: { id: string; name: string };
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpensePage {
  expenses: ExpenseView[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface Actor {
  userId: string;
  role: Role;
}

// Money leaves the API as a fixed 2-decimal string, dates as YYYY-MM-DD.
function toView(row: ExpenseRow): ExpenseView {
  return {
    id: row.id,
    amount: row.amount.toFixed(2),
    currency: row.currency,
    category: row.category,
    date: row.date.toISOString().slice(0, 10),
    description: row.description,
    merchant: row.merchant,
    receiptUrl: row.receiptUrl,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Only the creator or a company ADMIN may change an expense. The lookup includes
// companyId, so an expense from another company is simply "not found".
async function findChangeableExpenseId(
  companyId: string,
  expenseId: string,
  actor: Actor,
): Promise<string> {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, companyId },
    select: { id: true, createdById: true },
  });
  if (!expense) {
    throw AppError.notFound('Expense not found');
  }
  if (actor.role !== 'ADMIN' && expense.createdById !== actor.userId) {
    throw AppError.forbidden('Only the creator or a company admin can change this expense');
  }
  return expense.id;
}

export async function createExpense(
  companyId: string,
  userId: string,
  input: CreateExpenseInput,
): Promise<ExpenseView> {
  const created = await prisma.expense.create({
    data: {
      companyId,
      createdById: userId,
      amount: input.amount,
      currency: input.currency,
      category: input.category,
      date: input.date,
      description: input.description,
      merchant: input.merchant,
      receiptUrl: input.receiptUrl,
    },
    select: expenseSelect,
  });
  return toView(created);
}

export async function listExpenses(
  companyId: string,
  query: ListExpensesQuery,
): Promise<ExpensePage> {
  const where = {
    companyId,
    ...(query.category ? { category: query.category } : {}),
    ...(query.date_from || query.date_to
      ? {
          date: {
            ...(query.date_from ? { gte: query.date_from } : {}),
            ...(query.date_to ? { lte: query.date_to } : {}),
          },
        }
      : {}),
    ...(query.min_amount !== undefined || query.max_amount !== undefined
      ? {
          amount: {
            ...(query.min_amount !== undefined ? { gte: query.min_amount } : {}),
            ...(query.max_amount !== undefined ? { lte: query.max_amount } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.expense.findMany({
      where,
      select: expenseSelect,
      // createdAt and id break ties so pages never overlap or skip rows.
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.page_size,
      take: query.page_size,
    }),
    prisma.expense.count({ where }),
  ]);

  return {
    expenses: rows.map(toView),
    pagination: {
      page: query.page,
      pageSize: query.page_size,
      total,
      totalPages: Math.ceil(total / query.page_size),
    },
  };
}

export async function getExpense(companyId: string, expenseId: string): Promise<ExpenseView> {
  const row = await prisma.expense.findFirst({
    where: { id: expenseId, companyId },
    select: expenseSelect,
  });
  if (!row) {
    throw AppError.notFound('Expense not found');
  }
  return toView(row);
}

export async function updateExpense(
  companyId: string,
  expenseId: string,
  actor: Actor,
  input: UpdateExpenseInput,
): Promise<ExpenseView> {
  const id = await findChangeableExpenseId(companyId, expenseId, actor);
  // Prisma skips undefined fields and writes null to clear nullable ones.
  const updated = await prisma.expense.update({
    where: { id },
    data: {
      amount: input.amount,
      currency: input.currency,
      category: input.category,
      date: input.date,
      description: input.description,
      merchant: input.merchant,
      receiptUrl: input.receiptUrl,
    },
    select: expenseSelect,
  });
  return toView(updated);
}

export async function deleteExpense(
  companyId: string,
  expenseId: string,
  actor: Actor,
): Promise<void> {
  const id = await findChangeableExpenseId(companyId, expenseId, actor);
  await prisma.expense.delete({ where: { id } });
}