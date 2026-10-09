import type { TestAgent } from './auth';

type InviteRole = 'ADMIN' | 'MEMBER';

export async function inviteCodeFor(
  admin: TestAgent,
  companyId: string,
  role?: InviteRole,
): Promise<string> {
  const res = await admin
    .post(`/api/companies/${companyId}/invites`)
    .send(role ? { role } : {})
    .expect(201);
  return res.body.data.invite.code as string;
}

// Admin invites, member accepts.
export async function joinCompany(
  admin: TestAgent,
  companyId: string,
  member: TestAgent,
  role?: InviteRole,
): Promise<void> {
  const code = await inviteCodeFor(admin, companyId, role);
  await member.post('/api/invites/accept').send({ code }).expect(200);
}