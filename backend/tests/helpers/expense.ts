import type { TestAgent } from './auth';

export const sampleExpense = {
  amount: '450.00',
  category: 'FOOD',
  date: '2026-10-05',
  description: 'Team lunch',
};

export async function createExpenseAs(
  agent: TestAgent,
  companyId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await agent
    .post(`/api/companies/${companyId}/expenses`)
    .send({ ...sampleExpense, ...overrides })
    .expect(201);
  return res.body.data.expense.id as string;
}