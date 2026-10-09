import type { Role } from '../generated/prisma/enums';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface CompanyMembership {
  companyId: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      membership?: CompanyMembership;
    }
  }
}