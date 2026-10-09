import { prisma } from '../config/db';
import type { LoginInput, SignupInput } from '../schemas/auth.schema';
import { AppError } from '../utils/AppError';
import { hashPassword, verifyPassword } from '../utils/password';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

// Never select passwordHash for anything returned to a client.
const publicUserSelect = { id: true, name: true, email: true, createdAt: true } as const;

// Used so a login for an unknown email still costs one bcrypt comparison.
const dummyHash = hashPassword('spendlite-dummy-password-for-timing');

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export async function signup(input: SignupInput): Promise<PublicUser> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    throw AppError.conflict('An account with this email already exists');
  }

  const passwordHash = await hashPassword(input.password);

  try {
    return await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash },
      select: publicUserSelect,
    });
  } catch (error) {
    // Two simultaneous signups can both pass the check above; the DB unique index decides.
    if (isUniqueViolation(error)) {
      throw AppError.conflict('An account with this email already exists');
    }
    throw error;
  }
}

export async function login(input: LoginInput): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  const hashToCheck = user?.passwordHash ?? (await dummyHash);
  const passwordMatches = await verifyPassword(input.password, hashToCheck);

  if (!user || !passwordMatches) {
    // Same message for unknown email and wrong password.
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}