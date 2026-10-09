import { randomBytes } from 'node:crypto';
import { prisma } from '../config/db';
import type { Role } from '../generated/prisma/enums';
import { AppError } from '../utils/AppError';
import { isUniqueViolation } from '../utils/prismaErrors';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface InviteView {
  code: string;
  role: Role;
  expiresAt: Date;
}

export interface JoinedCompany {
  id: string;
  name: string;
  role: Role;
}

// One message for unknown, expired, and used codes, so codes can't be probed.
const invalidInvite = (): AppError =>
  new AppError(400, 'INVALID_INVITE', 'This invite is invalid, expired, or already used');

export async function createInvite(
  companyId: string,
  createdById: string,
  role: Role,
): Promise<InviteView> {
  return prisma.invite.create({
    data: {
      // 128 bits of randomness, URL-safe, so the code can be shared as a link.
      code: randomBytes(16).toString('base64url'),
      companyId,
      createdById,
      role,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
    select: { code: true, role: true, expiresAt: true },
  });
}

export async function acceptInvite(userId: string, code: string): Promise<JoinedCompany> {
  try {
    return await prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findUnique({
        where: { code },
        select: {
          id: true,
          companyId: true,
          role: true,
          expiresAt: true,
          usedAt: true,
          company: { select: { name: true } },
        },
      });
      if (!invite || invite.usedAt !== null || invite.expiresAt <= new Date()) {
        throw invalidInvite();
      }

      const existing = await tx.companyMember.findUnique({
        where: { companyId_userId: { companyId: invite.companyId, userId } },
        select: { userId: true },
      });
      if (existing) {
        // Thrown before the invite is claimed, so it stays usable for someone else.
        throw AppError.conflict('You are already a member of this company');
      }

      // Conditional update: if two people race on one code, only one claim succeeds.
      const claimed = await tx.invite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw invalidInvite();
      }

      await tx.companyMember.create({
        data: { companyId: invite.companyId, userId, role: invite.role },
      });

      return { id: invite.companyId, name: invite.company.name, role: invite.role };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict('You are already a member of this company');
    }
    throw error;
  }
}