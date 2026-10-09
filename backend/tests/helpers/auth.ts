import type { Express } from 'express';
import request from 'supertest';

export type TestAgent = ReturnType<typeof request.agent>;

export const TEST_PASSWORD = 'Passw0rd-Test1';

// Signs a new user up and returns an agent that carries their session cookie.
export async function registerAgent(
  app: Express,
  email: string,
  name = 'Test User',
): Promise<{ agent: TestAgent; userId: string }> {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/signup')
    .send({ name, email, password: TEST_PASSWORD })
    .expect(201);
  return { agent, userId: res.body.data.user.id as string };
}

export async function createCompanyAs(agent: TestAgent, name = 'Acme Pvt Ltd'): Promise<string> {
  const res = await agent.post('/api/companies').send({ name }).expect(201);
  return res.body.data.company.id as string;
}