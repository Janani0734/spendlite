import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/db';
import { createCompanyAs, registerAgent } from './helpers/auth';
import { inviteCodeFor, joinCompany } from './helpers/company';
import { resetDatabase } from './helpers/db';

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

describe('POST /api/companies/:companyId/invites', () => {
  it('lets an admin create an invite that expires in about 7 days', async () => {
    const alice = await registerAgent(app, 'alice@example.com');
    const companyId = await createCompanyAs(alice.agent);

    const res = await alice.agent.post(`/api/companies/${companyId}/invites`).send({});

    expect(res.status).toBe(201);
    expect(res.body.data.invite.role).toBe('MEMBER');
    expect((res.body.data.invite.code as string).length).toBeGreaterThanOrEqual(20);
    const days =
      (new Date(res.body.data.invite.expiresAt as string).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it('works without a request body', async () => {
    const alice = await registerAgent(app, 'alice@example.com');
    const companyId = await createCompanyAs(alice.agent);

    const res = await alice.agent.post(`/api/companies/${companyId}/invites`);

    expect(res.status).toBe(201);
    expect(res.body.data.invite.role).toBe('MEMBER');
  });

  it('forbids regular members', async () => {
    const alice = await registerAgent(app, 'alice@example.com');
    const bob = await registerAgent(app, 'bob@example.com');
    const companyId = await createCompanyAs(alice.agent);
    await joinCompany(alice.agent, companyId, bob.agent);

    const res = await bob.agent.post(`/api/companies/${companyId}/invites`).send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(await prisma.invite.count()).toBe(1); // only the one used to add Bob
  });

  it('returns 404 to non-members', async () => {
    const alice = await registerAgent(app, 'alice@example.com');
    const bob = await registerAgent(app, 'bob@example.com');
    const companyId = await createCompanyAs(alice.agent);

    const res = await bob.agent.post(`/api/companies/${companyId}/invites`).send({});

    expect(res.status).toBe(404);
    expect(await prisma.invite.count()).toBe(0);
  });

  it('requires login', async () => {
    const res = await request(app).post(`/api/companies/${randomUUID()}/invites`).send({});

    expect(res.status).toBe(401);
  });

  it('rejects an unknown role', async () => {
    const alice = await registerAgent(app, 'alice@example.com');
    const companyId = await createCompanyAs(alice.agent);

    const res = await alice.agent.post(`/api/companies/${companyId}/invites`).send({ role: 'OWNER' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/invites/accept', () => {
  it('adds the user as a MEMBER and grants access to the company', async () => {
    const alice = await registerAgent(app, 'alice@example.com');
    const bob = await registerAgent(app, 'bob@example.com');
    const companyId = await createCompanyAs(alice.agent, 'Acme Pvt Ltd');
    const code = await inviteCodeFor(alice.agent, companyId);

    const res = await bob.agent.post('/api/invites/accept').send({ code });

    expect(res.status).toBe(200);
    expect(res.body.data.company).toMatchObject({
      id: companyId,
      name: 'Acme Pvt Ltd',
      role: 'MEMBER',
    });

    const detail = await bob.agent.get(`/api/companies/${companyId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.company).toMatchObject({ role: 'MEMBER', memberCount: 2 });
  });

  it('grants ADMIN when the invite was created for ADMIN', async () => {
    const alice = await registerAgent(app, 'alice@example.com');
    const bob = await registerAgent(app, 'bob@example.com');
    const companyId = await createCompanyAs(alice.agent);

    await joinCompany(alice.agent, companyId, bob.agent, 'ADMIN');

    const res = await bob.agent.post(`/api/companies/${companyId}/invites`).send({});
    expect(res.status).toBe(201);
  });

  it('is single-use', async () => {
    const alice = await registerAgent(app, 'alice@example.com');
    const bob = await registerAgent(app, 'bob@example.com');
    const carol = await registerAgent(app, 'carol@example.com');
    const companyId = await createCompanyAs(alice.agent);
    const code = await inviteCodeFor(alice.agent, companyId);
    await bob.agent.post('/api/invites/accept').send({ code }).expect(200);

    const res = await carol.agent.post('/api/invites/accept').send({ code });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INVITE');
    await carol.agent.get(`/api/companies/${companyId}`).expect(404);
  });

  it('rejects an expired invite', async () => {
    const alice = await registerAgent(app, 'alice@example.com');
    const bob = await registerAgent(app, 'bob@example.com');
    const companyId = await createCompanyAs(alice.agent);
    const code = await inviteCodeFor(alice.agent, companyId);
    await prisma.invite.update({ where: { code }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await bob.agent.post('/api/invites/accept').send({ code });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INVITE');
    await bob.agent.get(`/api/companies/${companyId}`).expect(404);
  });

  it('rejects an unknown code with the same error', async () => {
    const bob = await registerAgent(app, 'bob@example.com');

    const res = await bob.agent.post('/api/invites/accept').send({ code: 'x'.repeat(22) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INVITE');
  });

  it('does not use up the invite when the user is already a member', async () => {
    const alice = await registerAgent(app, 'alice@example.com');
    const companyId = await createCompanyAs(alice.agent);
    const code = await inviteCodeFor(alice.agent, companyId);

    const res = await alice.agent.post('/api/invites/accept').send({ code });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    const invite = await prisma.invite.findUniqueOrThrow({ where: { code } });
    expect(invite.usedAt).toBeNull();
  });

  it('requires login', async () => {
    const res = await request(app).post('/api/invites/accept').send({ code: 'x'.repeat(22) });

    expect(res.status).toBe(401);
  });

  it('rejects a body without a code', async () => {
    const bob = await registerAgent(app, 'bob@example.com');

    const res = await bob.agent.post('/api/invites/accept').send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/companies/:companyId/members', () => {
  it('lets any member list the members without exposing secrets', async () => {
    const alice = await registerAgent(app, 'alice@example.com', 'Alice');
    const bob = await registerAgent(app, 'bob@example.com', 'Bob');
    const companyId = await createCompanyAs(alice.agent);
    await joinCompany(alice.agent, companyId, bob.agent);

    const res = await bob.agent.get(`/api/companies/${companyId}/members`);

    expect(res.status).toBe(200);
    const members = res.body.data.members as { email: string; role: string }[];
    expect(members.map((m) => [m.email, m.role])).toEqual([
      ['alice@example.com', 'ADMIN'],
      ['bob@example.com', 'MEMBER'],
    ]);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('returns 404 to non-members', async () => {
    const alice = await registerAgent(app, 'alice@example.com');
    const bob = await registerAgent(app, 'bob@example.com');
    const companyId = await createCompanyAs(alice.agent);

    const res = await bob.agent.get(`/api/companies/${companyId}/members`);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/companies/:companyId', () => {
  it('forbids regular members and keeps the company', async () => {
    const alice = await registerAgent(app, 'alice@example.com');
    const bob = await registerAgent(app, 'bob@example.com');
    const companyId = await createCompanyAs(alice.agent);
    await joinCompany(alice.agent, companyId, bob.agent);

    const res = await bob.agent.delete(`/api/companies/${companyId}`);

    expect(res.status).toBe(403);
    expect(await prisma.company.count()).toBe(1);
  });

  it('lets an admin delete the company and everything under it', async () => {
    const alice = await registerAgent(app, 'alice@example.com');
    const bob = await registerAgent(app, 'bob@example.com');
    const companyId = await createCompanyAs(alice.agent);
    await joinCompany(alice.agent, companyId, bob.agent);
    await prisma.expense.create({
      data: {
        companyId,
        createdById: alice.userId,
        amount: 450,
        category: 'FOOD',
        date: new Date('2026-10-01'),
        description: 'Team lunch',
      },
    });
    await prisma.budget.create({ data: { companyId, year: 2026, month: 10, amount: 5000 } });

    const res = await alice.agent.delete(`/api/companies/${companyId}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true });
    expect(await prisma.company.count()).toBe(0);
    expect(await prisma.companyMember.count()).toBe(0);
    expect(await prisma.invite.count()).toBe(0);
    expect(await prisma.expense.count()).toBe(0);
    expect(await prisma.budget.count()).toBe(0);
    expect(await prisma.user.count()).toBe(2); // accounts are untouched
    await bob.agent.get(`/api/companies/${companyId}`).expect(404);
  });

  it('returns 404 to non-members and leaves the company alone', async () => {
    const alice = await registerAgent(app, 'alice@example.com');
    const bob = await registerAgent(app, 'bob@example.com');
    const companyId = await createCompanyAs(alice.agent);

    const res = await bob.agent.delete(`/api/companies/${companyId}`);

    expect(res.status).toBe(404);
    expect(await prisma.company.count()).toBe(1);
  });
});