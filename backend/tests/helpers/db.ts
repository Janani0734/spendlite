import { prisma } from '../../src/config/db';

// Deletes every row, children before parents so foreign keys never block it.
export async function resetDatabase(): Promise<void> {
  await prisma.expense.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.companyMember.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();
}