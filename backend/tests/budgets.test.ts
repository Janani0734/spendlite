import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/db';
import { createCompanyAs, registerAgent } from './helpers/auth';
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
  return { alice, companyId, base: `/api/companies/${companyId}/budgets` };
}

interface Line {
  category?: string;
  budget: string | null;
  spent: string;
  remaining: string | null;
  percentUsed: number | null;
  status: string;
}

function categoryLines(body: unknown): Line[] {
  return (body as { data: { categories: Line[] } }).data.categories;
}

function lineFor(body: unknown, category: string): Line {
  const found = categoryLines(body).find((line) => line.category === category);
  if (!found) {
    throw new Error(`No line for category ${category}`);
  }
  return found;
}

describe('PUT /api/companies/:companyId/budgets', () => {
  it('sets the company-wide monthly budget when no category is given', async () => {
    const { alice, base } = await setup();

    const res = await alice.agent.put(base).send({ year: 2026, month: 10, amount: 50000 });

    expect(res.status).toBe(200);
    expect(res.body.data.budget).toMatchObject({
      year: 2026,
      month: 10,
      category: null,
      amount: '50000.00',
    });
  });

  it('sets a category budget, ignoring letter case', async () => {
    const { alice, base } = await setup();

    const res = await alice.agent
      .put(base)
      .send({ year: 2026, month: 10, category: 'travel', amount: '2000.50' });

    expect(res.status).toBe(200);
    expect(res.body.data.budget).toMatchObject({ category: 'TRAVEL', amount: '2000.50' });
  });

  it('updates in place when the overall budget is set again', async () => {
    const { alice, base } = await setup();

    const first = await alice.agent.put(base).send({ year: 2026, month: 10, amount: 1000 });
    const second = await alice.agent.put(base).send({ year: 2026, month: 10, amount: 1500 });

    expect(second.status).toBe(200);
    expect(second.body.data.budget.amount).toBe('1500.00');
    expect(second.body.data.budget.id).toBe(first.body.data.budget.id);
    expect(await prisma.budget.count()).toBe(1);
  });

  it('keeps one budget per month and category, and lets different ones coexist', async () => {
    const { alice, base } = await setup();

    await alice.agent.put(base).send({ year: 2026, month: 10, amount: 5000 }).expect(200);
    await alice.agent
      .put(base)
      .send({ year: 2026, month: 10, category: 'FOOD', amount: 500 })
      .expect(200);
    await alice.agent
      .put(base)
      .send({ year: 2026, month: 10, category: 'TRAVEL', amount: 2000 })
      .expect(200);
    await alice.agent
      .put(base)
      .send({ year: 2026, month: 11, category: 'FOOD', amount: 700 })
      .expect(200);
    expect(await prisma.budget.count()).toBe(4);

    await alice.agent
      .put(base)
      .send({ year: 2026, month: 10, category: 'FOOD', amount: 600 })
      .expect(200);
    expect(await prisma.budget.count()).toBe(4);
  });

  it('forbids regular members', async () => {
    const { alice, companyId, base } = await setup();
    const bob = await registerAgent(app, 'bob@example.com');
    await joinCompany(alice.agent, companyId, bob.agent);

    const res = await bob.agent.put(base).send({ year: 2026, month: 10, amount: 1000 });

    expect(res.status).toBe(403);
    expect(await prisma.budget.count()).toBe(0);
  });

  it('returns 404 to non-members', async () => {
    const { base } = await setup();
    const bob = await registerAgent(app, 'bob@example.com');

    const res = await bob.agent.put(base).send({ year: 2026, month: 10, amount: 1000 });

    expect(res.status).toBe(404);
    expect(await prisma.budget.count()).toBe(0);
  });

  it('requires login', async () => {
    const res = await request(app)
      .put(`/api/companies/${randomUUID()}/budgets`)
      .send({ year: 2026, month: 10, amount: 1000 });

    expect(res.status).toBe(401);
  });

  const invalidPayloads: [string, Record<string, unknown>, string][] = [
    ['month 13', { month: 13 }, 'month'],
    ['month 0', { month: 0 }, 'month'],
    ['year 1999', { year: 1999 }, 'year'],
    ['a non-numeric year', { year: 'abc' }, 'year'],
    ['a zero amount', { amount: 0 }, 'amount'],
    ['a negative amount', { amount: '-5' }, 'amount'],
    ['a missing amount', { amount: undefined }, 'amount'],
    ['an unknown category', { category: 'GAMES' }, 'category'],
  ];

  it.each(invalidPayloads)('rejects %s', async (_label, overrides, field) => {
    const { alice, base } = await setup();

    const res = await alice.agent
      .put(base)
      .send({ year: 2026, month: 10, amount: 1000, ...overrides });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fieldErrors).toHaveProperty(field);
    expect(await prisma.budget.count()).toBe(0);
  });
});

describe('GET /api/companies/:companyId/budgets/status', () => {
  it('compares spend with the overall and per-category budgets for the month', async () => {
    const { alice, companyId, base } = await setup();
    await alice.agent.put(base).send({ year: 2026, month: 10, amount: 5000 }).expect(200);
    await alice.agent
      .put(base)
      .send({ year: 2026, month: 10, category: 'FOOD', amount: 500 })
      .expect(200);
    await alice.agent
      .put(base)
      .send({ year: 2026, month: 10, category: 'TRAVEL', amount: 2000 })
      .expect(200);

    // October spend for this company: 100 + 450 food, 1700 travel, 999 software.
    await createExpenseAs(alice.agent, companyId, { category: 'FOOD', amount: '100', date: '2026-10-01' });
    await createExpenseAs(alice.agent, companyId, { category: 'FOOD', amount: '450', date: '2026-10-04' });
    await createExpenseAs(alice.agent, companyId, { category: 'TRAVEL', amount: '1700', date: '2026-10-03' });
    await createExpenseAs(alice.agent, companyId, { category: 'SOFTWARE', amount: '999', date: '2026-10-05' });
    // Must not count: a different month, and a different company.
    await createExpenseAs(alice.agent, companyId, { category: 'FOOD', amount: '1000', date: '2026-09-28' });
    const bob = await registerAgent(app, 'bob@example.com');
    const bobCompanyId = await createCompanyAs(bob.agent, 'Bob Inc');
    await createExpenseAs(bob.agent, bobCompanyId, { category: 'TRAVEL', amount: '9999', date: '2026-10-02' });

    const res = await alice.agent.get(`${base}/status?year=2026&month=10`);

    expect(res.status).toBe(200);
    expect(res.body.data.period).toEqual({ year: 2026, month: 10 });
    expect(res.body.data.overall).toEqual({
      budget: '5000.00',
      spent: '3249.00',
      remaining: '1751.00',
      percentUsed: 65,
      status: 'OK',
    });
    expect(lineFor(res.body, 'FOOD')).toEqual({
      category: 'FOOD',
      budget: '500.00',
      spent: '550.00',
      remaining: '-50.00',
      percentUsed: 110,
      status: 'OVER_BUDGET',
    });
    expect(lineFor(res.body, 'TRAVEL')).toEqual({
      category: 'TRAVEL',
      budget: '2000.00',
      spent: '1700.00',
      remaining: '300.00',
      percentUsed: 85,
      status: 'WARNING',
    });
    expect(lineFor(res.body, 'SOFTWARE')).toEqual({
      category: 'SOFTWARE',
      budget: null,
      spent: '999.00',
      remaining: null,
      percentUsed: null,
      status: 'NO_BUDGET',
    });
    expect(lineFor(res.body, 'OFFICE')).toMatchObject({ spent: '0.00', status: 'NO_BUDGET' });
    expect(categoryLines(res.body).map((line) => line.category)).toEqual([
      'TRAVEL',
      'FOOD',
      'SOFTWARE',
      'OFFICE',
      'MARKETING',
      'OTHER',
    ]);
  });

  it('counts only the requested month, including its first and last day', async () => {
    const { alice, companyId, base } = await setup();
    await alice.agent.put(base).send({ year: 2026, month: 10, amount: 1000 }).expect(200);
    await createExpenseAs(alice.agent, companyId, { amount: '100', date: '2026-09-30' });
    await createExpenseAs(alice.agent, companyId, { amount: '200', date: '2026-10-01' });
    await createExpenseAs(alice.agent, companyId, { amount: '300', date: '2026-10-31' });
    await createExpenseAs(alice.agent, companyId, { amount: '400', date: '2026-11-01' });

    const res = await alice.agent.get(`${base}/status?year=2026&month=10`);

    expect(res.body.data.overall.spent).toBe('500.00');
    expect(res.body.data.overall.percentUsed).toBe(50);
  });

  const thresholdCases: [string, string][] = [
    ['800.00', 'OK'],
    ['800.01', 'WARNING'],
    ['1000.00', 'WARNING'],
    ['1000.01', 'OVER_BUDGET'],
  ];

  it.each(thresholdCases)(
    'marks spend of %s against a 1000.00 budget as %s',
    async (spent, expected) => {
      const { alice, companyId, base } = await setup();
      await alice.agent
        .put(base)
        .send({ year: 2026, month: 10, category: 'FOOD', amount: 1000 })
        .expect(200);
      await prisma.expense.create({
        data: {
          companyId,
          createdById: alice.userId,
          amount: spent,
          category: 'FOOD',
          date: new Date('2026-10-15'),
          description: 'Threshold check',
        },
      });

      const res = await alice.agent.get(`${base}/status?year=2026&month=10`);

      expect(lineFor(res.body, 'FOOD').status).toBe(expected);
    },
  );

  it('defaults to the current month when no year or month is given', async () => {
    const { alice, base } = await setup();
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    await alice.agent.put(base).send({ year, month, amount: 1000 }).expect(200);

    const res = await alice.agent.get(`${base}/status`);

    expect(res.status).toBe(200);
    expect(res.body.data.period).toEqual({ year, month });
    expect(res.body.data.overall.budget).toBe('1000.00');
  });

  it('reports an empty month with no budgets and no spend', async () => {
    const { alice, base } = await setup();

    const res = await alice.agent.get(`${base}/status?year=2026&month=10`);

    expect(res.status).toBe(200);
    expect(res.body.data.overall).toEqual({
      budget: null,
      spent: '0.00',
      remaining: null,
      percentUsed: null,
      status: 'NO_BUDGET',
    });
    expect(categoryLines(res.body)).toHaveLength(6);
  });

  it('lets regular members read the status', async () => {
    const { alice, companyId, base } = await setup();
    const bob = await registerAgent(app, 'bob@example.com');
    await joinCompany(alice.agent, companyId, bob.agent);
    await alice.agent.put(base).send({ year: 2026, month: 10, amount: 1000 }).expect(200);

    const res = await bob.agent.get(`${base}/status?year=2026&month=10`);

    expect(res.status).toBe(200);
    expect(res.body.data.overall.budget).toBe('1000.00');
  });

  it('returns 404 to non-members', async () => {
    const { base } = await setup();
    const bob = await registerAgent(app, 'bob@example.com');

    const res = await bob.agent.get(`${base}/status`);

    expect(res.status).toBe(404);
  });

  it('requires login', async () => {
    const res = await request(app).get(`/api/companies/${randomUUID()}/budgets/status`);

    expect(res.status).toBe(401);
  });

  const invalidQueries = ['month=13', 'year=1999', 'month=abc'];

  it.each(invalidQueries)('rejects the query "%s"', async (queryString) => {
    const { alice, base } = await setup();

    const res = await alice.agent.get(`${base}/status?${queryString}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});