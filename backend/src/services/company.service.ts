import { prisma } from '../config/db';
import type { Role } from '../generated/prisma/enums';
import type { CreateCompanyInput } from '../schemas/company.schema';
import { AppError } from '../utils/AppError';

export interface CompanySummary {
  id: string;
  name: string;
  createdAt: Date;
  role: Role;
}

export interface CompanyDetail extends CompanySummary {
  memberCount: number;
}

// One nested write, so the company and its first ADMIN membership are created atomically.
export async function createCompany(
  userId: string,
  input: CreateCompanyInput,
): Promise<CompanySummary> {
  const company = await prisma.company.create({
    data: {
      name: input.name,
      createdById: userId,
      members: { create: { userId, role: 'ADMIN' } },
    },
    select: { id: true, name: true, createdAt: true },
  });
  return { ...company, role: 'ADMIN' };
}

export async function listCompanies(userId: string): Promise<CompanySummary[]> {
  const memberships = await prisma.companyMember.findMany({
    where: { userId },
    select: { role: true, company: { select: { id: true, name: true, createdAt: true } } },
    orderBy: { joinedAt: 'asc' },
  });
  return memberships.map((membership) => ({ ...membership.company, role: membership.role }));
}

export async function getCompany(companyId: string, role: Role): Promise<CompanyDetail> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
  });
  if (!company) {
    throw AppError.notFound('Company not found');
  }
  return {
    id: company.id,
    name: company.name,
    createdAt: company.createdAt,
    role,
    memberCount: company._count.members,
  };
}