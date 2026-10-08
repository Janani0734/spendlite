import { compare, hash } from 'bcryptjs';
import { env } from '../config/env';

// bcrypt only uses the first 72 bytes, so signup validation caps passwords at 72.
export function hashPassword(plain: string): Promise<string> {
  return hash(plain, env.BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return compare(plain, passwordHash);
}