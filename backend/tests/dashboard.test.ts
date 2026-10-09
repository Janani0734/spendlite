import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createCompanyAs, registerAgent, type TestAgent } from './helpers/auth';
import { joinCompany } from './helpers/company';
import { resetDatabase } from './helpers/db';
import { createExpenseAs } from './helpers/expense';

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

async function setup(): Promise<{
  alice: Awaited<ReturnType<typeof registerAgent>>;
  companyId: string;
  base: string;
}> {
  const alice = await registerAgent(app, 'alice@example.com');
  const companyId = await createCompanyAs(alice.agent);
  return { alice, companyId, base: `/api/companies/${companyId}/dashboard` };
}

// October 2026: FOOD 100 + 450, TRAVEL 1700, SOFTWARE 999 (total 3249, 4 expenses).
// September 2026 is the previous month. A second company's expense must never count.
async function seedOctober(agent: TestAgent, companyId: string): Promise<void> {
  await createExpenseAs(agent, companyId, { category: 'FOOD', amount: '100', date: '2026-10-01' });
  await createExpenseAs(agent, companyId, { category: 'TRAVEL', amount: '1700', date: '2026-10-03' });
  await createExpenseAs(agent, companyId, { category: 'FOOD', amount: '450', date: '2026-10-04' });
  await createExpenseAs(agent, companyId, { category: 'SOFTWARE', amount: '999', date: '2026-10-05' });
  await createExpenseAs(agent, companyId, { category: 'FOOD', amount: '1000', date: '2026-09-28' });
  await createExpenseAs(agent, companyId, { category: 'TRAVEL', amount: '850', date: '2026-09-15' });

  const other = await registerAgent(app, 'other-owner@example.com');
  const otherCompanyId = await createCompanyAs(other.agent, 'Other Inc');
  await createExpenseAs(other.agent, otherCompanyId, {
    category: 'TRAVEL',
    amount: '9999',
    date: '2026-10-02',
  });
}

describe('GET /api/companies/:companyId/dashboard', () => {
  it('summarises the month: total, count, average, and spend by category', async () => {
    const { alice, companyId, base } = await setup();
    await seedOctober(alice.agent, companyId);

    const res = await alice.agent.get(`${base}?year=2026&month=10`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      period: { year: 2026, month: 10 },
      totalSpend: '3249.00',
      expenseCount: 4,
      averageExpense: '812.25',
      byCategory: [
        { category: 'TRAVEL', total: '1700.00', count: 1, percentOfTotal: 52.3 },
        { category: 'SOFTWARE', total: '999.00', count: 1, percentOfTotal: 30.7 },
        { category: 'FOOD', total: '550.00', count: 2, percentOfTotal: 16.9 },
      ],
    });
  });

  it('counts only the requested month, including its first and last day', async () => {
    const { alice, companyId, base } = await setup();
    await createExpenseAs(alice.agent, companyId, { amount: '100', date: '2026-09-30' });
    await createExpenseAs(alice.agent, companyId, { amount: '200', date: '2026-10-01' });
    await createExpenseAs(alice.agent, companyId, { amount: '300', date: '2026-10-31' });
    await createExpenseAs(alice.agent, companyId, { amount: '400', date: '2026-11-01' });

    const res = await alice.agent.get(`${base}?year=2026&month=10`);

    expect(res.body.data.totalSpend).toBe('500.00');
    expect(res.body.data.expenseCount).toBe(2);
    expect(res.body.data.averageExpense).toBe('250.00');
  });

  it('reports an empty month as zeros', async () => {
    const { alice, base } = await setup();

    const res = await alice.agent.get(`${base}?year=2026&month=10`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      period: { year: 2026, month: 10 },
      totalSpend: '0.00',
      expenseCount: 0,
      averageExpense: null,
      byCategory: [],
    });
  });

  it('defaults to the current month', async () => {
    const { alice, companyId, base } = await setup();
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    await createExpenseAs(alice.agent, companyId, { amount: '123', date: firstDay });

    const res = await alice.agent.get(base);

    expect(res.status).toBe(200);
    expect(res.body.data.period).toEqual({ year, month });
    expect(res.body.data.totalSpend).toBe('123.00');
  });

  it.each(['month=13', 'year=1999', 'month=abc'])('rejects the query "%s"', async (queryString) => {
    const { alice, base } = await setup();

    const res = await alice.agent.get(`${base}?${queryString}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/companies/:companyId/dashboard/top-categories', () => {
  it('ranks categories by spend and compares them with the previous month', async () => {
    const { alice, companyId, base } = await setup();
    await seedOctober(alice.agent, companyId);

    const res = await alice.agent.get(`${base}/top-categories?year=2026&month=10`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      period: { year: 2026, month: 10 },
      totalSpend: '3249.00',
      topCategories: [
        {
          rank: 1,
          category: 'TRAVEL',
          total: '1700.00',
          count: 1,
          percentOfTotal: 52.3,
          previousMonthTotal: '850.00',
          changePercent: 100,
        },
        {
          rank: 2,
          category: 'SOFTWARE',
          total: '999.00',
          count: 1,
          percentOfTotal: 30.7,
          previousMonthTotal: '0.00',
          changePercent: null,
        },
        {
          rank: 3,
          category: 'FOOD',
          total: '550.00',
          count: 2,
          percentOfTotal: 16.9,
          previousMonthTotal: '1000.00',
          changePercent: -45,
        },
      ],
    });
  });

  it('truncates to the limit but keeps shares relative to all spend', async () => {
    const { alice, companyId, base } = await setup();
    await seedOctober(alice.agent, companyId);

    const res = await alice.agent.get(`${base}/top-categories?year=2026&month=10&limit=2`);

    const categories = res.body.data.topCategories as { category: string; percentOfTotal: number }[];
    expect(categories.map((c) => c.category)).toEqual(['TRAVEL', 'SOFTWARE']);
    expect(categories[0]?.percentOfTotal).toBe(52.3);
    expect(res.body.data.totalSpend).toBe('3249.00');
  });

  it('compares January with December of the previous year', async () => {
    const { alice, companyId, base } = await setup();
    await createExpenseAs(alice.agent, companyId, { category: 'TRAVEL', amount: '300', date: '2025-12-20' });
    await createExpenseAs(alice.agent, companyId, { category: 'TRAVEL', amount: '600', date: '2026-01-10' });

    const res = await alice.agent.get(`${base}/top-categories?year=2026&month=1`);

    expect(res.body.data.topCategories[0]).toMatchObject({
      category: 'TRAVEL',
      total: '600.00',
      previousMonthTotal: '300.00',
      changePercent: 100,
    });
  });

  it.each(['limit=0', 'limit=7', 'limit=abc'])('rejects the query "%s"', async (queryString) => {
    const { alice, base } = await setup();

    const res = await alice.agent.get(`${base}/top-categories?${queryString}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/companies/:companyId/dashboard/review', () => {
  it('flags nothing when no expense reaches the default 10000 threshold', async () => {
    const { alice, companyId, base } = await setup();
    await seedOctober(alice.agent, companyId);

    const res = await alice.agent.get(`${base}/review?year=2026&month=10`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      period: { year: 2026, month: 10 },
      threshold: '10000.00',
      flaggedTotal: 0,
      expenses: [],
    });
  });

  it('flags expenses at or above the threshold, largest first, with times-average', async () => {
    const { alice, companyId, base } = await setup();
    await seedOctober(alice.agent, companyId);

    const res = await alice.agent.get(`${base}/review?year=2026&month=10&threshold=100`);

    expect(res.status).toBe(200);
    expect(res.body.data.threshold).toBe('100.00');
    expect(res.body.data.flaggedTotal).toBe(4);
    const expenses = res.body.data.expenses as { amount: string; timesCategoryAverage: number }[];
    expect(expenses.map((e) => e.amount)).toEqual(['1700.00', '999.00', '450.00', '100.00']);
    // FOOD averaged (100 + 450) / 2 = 275 in October; September's 1000 is not included.
    expect(expenses[2]).toMatchObject({
      amount: '450.00',
      category: 'FOOD',
      date: '2026-10-04',
      timesCategoryAverage: 1.6,
      createdBy: { id: alice.userId, name: 'Test User' },
    });
    expect(expenses[0]?.timesCategoryAverage).toBe(1);
  });

  it('trims the list to the limit but still reports how many were flagged', async () => {
    const { alice, companyId, base } = await setup();
    await seedOctober(alice.agent, companyId);

    const res = await alice.agent.get(`${base}/review?year=2026&month=10&threshold=100&limit=2`);

    const expenses = res.body.data.expenses as { amount: string }[];
    expect(expenses.map((e) => e.amount)).toEqual(['1700.00', '999.00']);
    expect(res.body.data.flaggedTotal).toBe(4);
  });

  const invalidQueries = [
    'threshold=0',
    'threshold=abc',
    'threshold=10.999',
    'limit=0',
    'limit=101',
    'month=13',
  ];

  it.each(invalidQueries)('rejects the query "%s"', async (queryString) => {
    const { alice, base } = await setup();

    const res = await alice.agent.get(`${base}/review?${queryString}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe.each(['', '/top-categories', '/review'])('access control for dashboard%s', (path) => {
  it('returns 404 to non-members', async () => {
    const { base } = await setup();
    const outsider = await registerAgent(app, 'outsider@example.com');

    const res = await outsider.agent.get(`${base}${path}`);

    expect(res.status).toBe(404);
  });

  it('requires login', async () => {
    const res = await request(app).get(`/api/companies/${randomUUID()}/dashboard${path}`);

    expect(res.status).toBe(401);
  });

  it('is readable by regular members', async () => {
    const { alice, companyId, base } = await setup();
    const bob = await registerAgent(app, 'bob@example.com');
    await joinCompany(alice.agent, companyId, bob.agent);

    const res = await bob.agent.get(`${base}${path}?year=2026&month=10`);

    expect(res.status).toBe(200);
  });
});