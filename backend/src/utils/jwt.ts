import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';

const payloadSchema = z.object({ sub: z.uuid() });

export function signAccessToken(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    expiresIn: env.JWT_EXPIRES_IN_SECONDS,
  });
}

// Returns the user id, or null for any invalid, expired, or tampered token.
export function verifyAccessToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    const parsed = payloadSchema.safeParse(decoded);
    return parsed.success ? parsed.data.sub : null;
  } catch {
    return null;
  }
}