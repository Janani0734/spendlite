import { z } from 'zod';

// Emails are trimmed and lowercased so "A@x.com" and "a@x.com" are the same account.
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const signupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  email,
  // bcrypt only uses the first 72 bytes, so longer passwords are rejected.
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(72),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;