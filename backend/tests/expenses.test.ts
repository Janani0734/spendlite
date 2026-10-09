import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/db';
import { createCompanyAs, registerAgent, type TestAgent } from './helpers/auth';
import { joinCompany } from './helpers/company';
import { resetDatabase } from './helpers/db';
import { createExpenseAs, sampleExpense } from './helpers/expense';

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
  return { alice, companyId, base: `/api/companies/${companyId}/expenses` };
}

function descriptionsOf(body: unknown): string[] {
  return (body as { data: { expenses: { description: string }[] } }).data.expenses.map(
    (expense) => expense.description,
  );
}

// Five expenses on distinct dates, so list order is fully predictable.
async function seedExpenses(agent: TestAgent, companyId: string): Promise<void> {
  await createExpenseAs(agent, companyId, {
    description: 'Coffee',
    category: 'FOOD',
    amount: '100.00',
    date: '2026-10-01',
  });
  await createExpenseAs(agent, companyId, {
    description: 'Flight',
    category: 'TRAVEL',
    amount: '2500.00',
    date: '2026-10-03',
  });
  await createExpenseAs(agent, companyId, {
    description: 'IDE license',
    category: 'SOFTWARE',
    amount: '999.00',
    date: '2026-10-05',
  });
  await createExpenseAs(agent, companyId, {
    description: 'Team lunch',
    category: 'FOOD',
    amount: '450.00',
    date: '2026-10-04',
  });
  await createExpenseAs(agent, companyId, {
    description: 'Pens',
    category: 'OFFICE',
    amount: '50.00',
    date: '2026-09-28',
  });
}

describe('POST /api/companies/:companyId/expenses', () => {
  it('creates an expense, normalising amount, category, and text', async () => {
    const { alice, base } = await setup();

    const res = await alice.agent.post(base).send({
      amount: 450.5,
      category: 'food',
      date: '2026-10-05',
      description: '  Team lunch  ',
      merchant: 'Swiggy',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.expense).toMatchObject({
      amount: '450.50',
      currency: 'INR',
      category: 'FOOD',
      date: '2026-10-05',
      description: 'Team lunch',
      merchant: 'Swiggy',
      receiptUrl: null,
      createdBy: { id: alice.userId, name: 'Test User' },
    });
  });

  const invalidPayloads: [string, Record<string, unknown>, string][] = [
    ['a zero amount', { amount: 0 }, 'amount'],
    ['a negative amount', { amount: '-5' }, 'amount'],
    ['an amount with 3 decimals', { amount: '10.999' }, 'amount'],
    ['a non-numeric amount', { amount: 'abc' }, 'amount'],
    ['an impossible date', { date: '2026-02-30' }, 'date'],
    ['a wrongly formatted date', { date: '05/10/2026' }, 'date'],
    ['an unknown category', { category: 'GAMES' }, 'category'],
    ['an unsupported currency', { currency: 'USD' }, 'currency'],
    ['a blank description', { description: '   ' }, 'description'],
    ['a javascript: receipt URL', { receiptUrl: 'javascript:alert(1)' }, 'receiptUrl'],
  ];

  it.each(invalidPayloads)('rejects %s', async (_label, overrides, field) => {
    const { alice, base } = await setup();

    const res = await alice.agent.post(base).send({ ...sampleExpense, ...overrides });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fieldErrors).toHaveProperty(field);
    expect(await prisma.expense.count()).toBe(0);
  });

  it('reports every missing required field', async () => {
    const { alice, base } = await setup();

    const res = await alice.agent.post(base).send({});

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fieldErrors as object).sort()).toEqual([
      'amount',
      'category',
      'date',
      'description',
    ]);
  });

  it('returns 404 to non-members and stores nothing', async () => {
    const { base } = await setup();
    const bob = await registerAgent(app, 'bob@example.com');

    const res = await bob.agent.post(base).send(sampleExpense);

    expect(res.status).toBe(404);
    expect(await prisma.expense.count()).toBe(0);
  });

  it('requires login', async () => {
    const res = await request(app)
      .post(`/api/companies/${randomUUID()}/expenses`)
      .send(sampleExpense);

    expect(res.status).toBe(401);
  });

  it('lets a regular member create expenses under their own name', async () => {
    const { alice, companyId, base } = await setup();
    const bob = await registerAgent(app, 'bob@example.com', 'Bob');
    await joinCompany(alice.agent, companyId, bob.agent);

    const res = await bob.agent.post(base).send(sampleExpense);

    expect(res.status).toBe(201);
    expect(res.body.data.expense.createdBy).toEqual({ id: bob.userId, name: 'Bob' });
  });
});

describe('GET /api/companies/:companyId/expenses', () => {
  it('lists newest first with pagination details', async () => {
    const { alice, companyId, base } = await setup();
    await seedExpenses(alice.agent, companyId);

    const res = await alice.agent.get(base);

    expect(res.status).toBe(200);
    expect(descriptionsOf(res.body)).toEqual([
      'IDE license',
      'Team lunch',
      'Flight',
      'Coffee',
      'Pens',
    ]);
    expect(res.body.data.pagination).toEqual({ page: 1, pageSize: 20, total: 5, totalPages: 1 });
  });

  it('paginates without overlap', async () => {
    const { alice, companyId, base } = await setup();
    await seedExpenses(alice.agent, companyId);

    const page2 = await alice.agent.get(`${base}?page=2&page_size=2`);
    const page3 = await alice.agent.get(`${base}?page=3&page_size=2`);
    const beyond = await alice.agent.get(`${base}?page=4&page_size=2`);

    expect(descriptionsOf(page2.body)).toEqual(['Flight', 'Coffee']);
    expect(page2.body.data.pagination).toEqual({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
    expect(descriptionsOf(page3.body)).toEqual(['Pens']);
    expect(descriptionsOf(beyond.body)).toEqual([]);
  });

  it('filters by category, ignoring letter case', async () => {
    const { alice, companyId, base } = await setup();
    await seedExpenses(alice.agent, companyId);

    const res = await alice.agent.get(`${base}?category=food`);

    expect(descriptionsOf(res.body)).toEqual(['Team lunch', 'Coffee']);
    expect(res.body.data.pagination.total).toBe(2);
  });

  it('filters by date range, inclusive at both ends', async () => {
    const { alice, companyId, base } = await setup();
    await seedExpenses(alice.agent, companyId);

    const res = await alice.agent.get(`${base}?date_from=2026-10-01&date_to=2026-10-04`);

    expect(descriptionsOf(res.body)).toEqual(['Team lunch', 'Flight', 'Coffee']);
  });

  it('filters by amount range, inclusive at both ends', async () => {
    const { alice, companyId, base } = await setup();
    await seedExpenses(alice.agent, companyId);

    const res = await alice.agent.get(`${base}?min_amount=100&max_amount=999`);

    expect(descriptionsOf(res.body)).toEqual(['IDE license', 'Team lunch', 'Coffee']);
  });

  it('combines filters', async () => {
    const { alice, companyId, base } = await setup();
    await seedExpenses(alice.agent, companyId);

    const res = await alice.agent.get(`${base}?category=FOOD&min_amount=200`);

    expect(descriptionsOf(res.body)).toEqual(['Team lunch']);
    expect(res.body.data.pagination.total).toBe(1);
  });

  const invalidQueries = [
    'page=0',
    'page_size=101',
    'page=abc',
    'category=GAMES',
    'date_from=2026-13-01',
    'date_from=2026-10-05&date_to=2026-10-01',
    'min_amount=500&max_amount=100',
  ];

  it.each(invalidQueries)('rejects the query "%s"', async (queryString) => {
    const { alice, base } = await setup();

    const res = await alice.agent.get(`${base}?${queryString}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it("never includes another company's expenses", async () => {
    const { alice, companyId, base } = await setup();
    await seedExpenses(alice.agent, companyId);
    const bob = await registerAgent(app, 'bob@example.com');
    const bobCompanyId = await createCompanyAs(bob.agent, 'Bob Inc');
    await createExpenseAs(bob.agent, bobCompanyId, { description: 'Bob secret' });

    const res = await alice.agent.get(base);

    expect(descriptionsOf(res.body)).not.toContain('Bob secret');
    expect(res.body.data.pagination.total).toBe(5);
  });

  it('returns 404 to non-members', async () => {
    const { base } = await setup();
    const bob = await registerAgent(app, 'bob@example.com');

    const res = await bob.agent.get(base);

    expect(res.status).toBe(404);
  });

  it("lets a regular member see everyone's expenses", async () => {
    const { alice, companyId, base } = await setup();
    await seedExpenses(alice.agent, companyId);
    const bob = await registerAgent(app, 'bob@example.com');
    await joinCompany(alice.agent, companyId, bob.agent);

    const res = await bob.agent.get(base);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(5);
  });
});

describe('GET /api/companies/:companyId/expenses/:expenseId', () => {
  it('returns one expense', async () => {
    const { alice, companyId, base } = await setup();
    const expenseId = await createExpenseAs(alice.agent, companyId);

    const res = await alice.agent.get(`${base}/${expenseId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.expense).toMatchObject({ id: expenseId, description: 'Team lunch' });
  });

  it('returns 404 for an expense that belongs to a different company', async () => {
    const { alice, companyId } = await setup();
    const otherCompanyId = await createCompanyAs(alice.agent, 'Second Co');
    const expenseId = await createExpenseAs(alice.agent, companyId);

    const res = await alice.agent.get(`/api/companies/${otherCompanyId}/expenses/${expenseId}`);

    expect(res.status).toBe(404);
  });

  it('returns 404 for a malformed id', async () => {
    const { alice, base } = await setup();

    const res = await alice.agent.get(`${base}/not-a-uuid`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 to non-members', async () => {
    const { alice, companyId, base } = await setup();
    const expenseId = await createExpenseAs(alice.agent, companyId);
    const bob = await registerAgent(app, 'bob@example.com');

    const res = await bob.agent.get(`${base}/${expenseId}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/companies/:companyId/expenses/:expenseId', () => {
  it('lets the creator change some fields and leaves the rest alone', async () => {
    const { alice, companyId, base } = await setup();
    const expenseId = await createExpenseAs(alice.agent, companyId, { merchant: 'Swiggy' });

    const res = await alice.agent
      .patch(`${base}/${expenseId}`)
      .send({ amount: '600', description: 'Team dinner' });

    expect(res.status).toBe(200);
    expect(res.body.data.expense).toMatchObject({
      amount: '600.00',
      description: 'Team dinner',
      merchant: 'Swiggy',
      category: 'FOOD',
      date: '2026-10-05',
    });
  });

  it('clears optional fields when they are set to null', async () => {
    const { alice, companyId, base } = await setup();
    const expenseId = await createExpenseAs(alice.agent, companyId, {
      merchant: 'Swiggy',
      receiptUrl: 'https://example.com/receipt.pdf',
    });

    const res = await alice.agent
      .patch(`${base}/${expenseId}`)
      .send({ merchant: null, receiptUrl: null });

    expect(res.status).toBe(200);
    expect(res.body.data.expense.merchant).toBeNull();
    expect(res.body.data.expense.receiptUrl).toBeNull();
  });

  it("forbids a regular member from editing someone else's expense", async () => {
    const { alice, companyId, base } = await setup();
    const bob = await registerAgent(app, 'bob@example.com');
    await joinCompany(alice.agent, companyId, bob.agent);
    const expenseId = await createExpenseAs(alice.agent, companyId);

    const res = await bob.agent.patch(`${base}/${expenseId}`).send({ description: 'Hacked' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    const stored = await prisma.expense.findUniqueOrThrow({ where: { id: expenseId } });
    expect(stored.description).toBe('Team lunch');
  });

  it("lets a company admin edit a member's expense", async () => {
    const { alice, companyId, base } = await setup();
    const bob = await registerAgent(app, 'bob@example.com');
    await joinCompany(alice.agent, companyId, bob.agent);
    const expenseId = await createExpenseAs(bob.agent, companyId);

    const res = await alice.agent.patch(`${base}/${expenseId}`).send({ category: 'TRAVEL' });

    expect(res.status).toBe(200);
    expect(res.body.data.expense.category).toBe('TRAVEL');
  });

  it('rejects an empty update', async () => {
    const { alice, companyId, base } = await setup();
    const expenseId = await createExpenseAs(alice.agent, companyId);

    const res = await alice.agent.patch(`${base}/${expenseId}`).send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid values and changes nothing', async () => {
    const { alice, companyId, base } = await setup();
    const expenseId = await createExpenseAs(alice.agent, companyId);

    const res = await alice.agent.patch(`${base}/${expenseId}`).send({ amount: '-1' });

    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors).toHaveProperty('amount');
    const stored = await prisma.expense.findUniqueOrThrow({ where: { id: expenseId } });
    expect(stored.amount.toFixed(2)).toBe('450.00');
  });

  it('returns 404 to non-members', async () => {
    const { alice, companyId, base } = await setup();
    const expenseId = await createExpenseAs(alice.agent, companyId);
    const bob = await registerAgent(app, 'bob@example.com');

    const res = await bob.agent.patch(`${base}/${expenseId}`).send({ description: 'Nope' });

    expect(res.status).toBe(404);
  });

  it('cannot reach an expense through a different company', async () => {
    const { alice, companyId } = await setup();
    const otherCompanyId = await createCompanyAs(alice.agent, 'Second Co');
    const expenseId = await createExpenseAs(alice.agent, companyId);

    const res = await alice.agent
      .patch(`/api/companies/${otherCompanyId}/expenses/${expenseId}`)
      .send({ description: 'Moved' });

    expect(res.status).toBe(404);
    const stored = await prisma.expense.findUniqueOrThrow({ where: { id: expenseId } });
    expect(stored.description).toBe('Team lunch');
  });
});

describe('DELETE /api/companies/:companyId/expenses/:expenseId', () => {
  it('lets the creator delete their expense', async () => {
    const { alice, companyId, base } = await setup();
    const bob = await registerAgent(app, 'bob@example.com');
    await joinCompany(alice.agent, companyId, bob.agent);
    const expenseId = await createExpenseAs(bob.agent, companyId);

    const res = await bob.agent.delete(`${base}/${expenseId}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true });
    expect(await prisma.expense.count()).toBe(0);
    await bob.agent.get(`${base}/${expenseId}`).expect(404);
  });

  it("forbids a regular member from deleting someone else's expense", async () => {
    const { alice, companyId, base } = await setup();
    const bob = await registerAgent(app, 'bob@example.com');
    await joinCompany(alice.agent, companyId, bob.agent);
    const expenseId = await createExpenseAs(alice.agent, companyId);

    const res = await bob.agent.delete(`${base}/${expenseId}`);

    expect(res.status).toBe(403);
    expect(await prisma.expense.count()).toBe(1);
  });

  it("lets a company admin delete a member's expense", async () => {
    const { alice, companyId, base } = await setup();
    const bob = await registerAgent(app, 'bob@example.com');
    await joinCompany(alice.agent, companyId, bob.agent);
    const expenseId = await createExpenseAs(bob.agent, companyId);

    const res = await alice.agent.delete(`${base}/${expenseId}`);

    expect(res.status).toBe(200);
    expect(await prisma.expense.count()).toBe(0);
  });

  it('returns 404 for an unknown expense', async () => {
    const { alice, base } = await setup();

    const res = await alice.agent.delete(`${base}/${randomUUID()}`);

    expect(res.status).toBe(404);
  });
});