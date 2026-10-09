import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/db';
import { createCompanyAs, registerAgent } from './helpers/auth';
import { resetDatabase } from './helpers/db';

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

describe('POST /api/companies', () => {
  it('creates a company and makes the creator its ADMIN', async () => {
    const { agent, userId } = await registerAgent(app, 'alice@example.com');

    const res = await agent.post('/api/companies').send({ name: '  Acme Pvt Ltd  ' });

    expect(res.status).toBe(201);
    expect(res.body.data.company).toMatchObject({ name: 'Acme Pvt Ltd', role: 'ADMIN' });

    const membership = await prisma.companyMember.findUniqueOrThrow({
      where: { companyId_userId: { companyId: res.body.data.company.id as string, userId } },
    });
    expect(membership.role).toBe('ADMIN');
  });

  it('rejects a name that is too short', async () => {
    const { agent } = await registerAgent(app, 'alice@example.com');

    const res = await agent.post('/api/companies').send({ name: 'A' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.company.count()).toBe(0);
  });

  it('requires a logged-in user', async () => {
    const post = await request(app).post('/api/companies').send({ name: 'Acme Pvt Ltd' });
    const list = await request(app).get('/api/companies');

    expect(post.status).toBe(401);
    expect(list.status).toBe(401);
  });
});

describe('GET /api/companies', () => {
  it('lists only the companies the user belongs to', async () => {
    const alice = await registerAgent(app, 'alice@example.com');
    const bob = await registerAgent(app, 'bob@example.com');
    await createCompanyAs(alice.agent, 'Alice One');
    await createCompanyAs(alice.agent, 'Alice Two');
    await createCompanyAs(bob.agent, 'Bob Inc');

    const res = await alice.agent.get('/api/companies');

    expect(res.status).toBe(200);
    const names = (res.body.data.companies as { name: string }[]).map((c) => c.name);
    expect(names).toEqual(['Alice One', 'Alice Two']);
  });
});

describe('GET /api/companies/:companyId', () => {
  it('returns the company, the caller role, and the member count', async () => {
    const { agent } = await registerAgent(app, 'alice@example.com');
    const companyId = await createCompanyAs(agent, 'Acme Pvt Ltd');

    const res = await agent.get(`/api/companies/${companyId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.company).toMatchObject({
      id: companyId,
      name: 'Acme Pvt Ltd',
      role: 'ADMIN',
      memberCount: 1,
    });
  });

  it('returns 404 to non-members, identical to a company that does not exist', async () => {
    const alice = await registerAgent(app, 'alice@example.com');
    const bob = await registerAgent(app, 'bob@example.com');
    const companyId = await createCompanyAs(alice.agent);

    const asOutsider = await bob.agent.get(`/api/companies/${companyId}`);
    const missing = await bob.agent.get(`/api/companies/${randomUUID()}`);

    expect(asOutsider.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(asOutsider.body).toEqual(missing.body);
  });

  it('returns 404 for a malformed company id', async () => {
    const { agent } = await registerAgent(app, 'alice@example.com');

    const res = await agent.get('/api/companies/not-a-uuid');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});