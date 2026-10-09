import { z } from 'zod';

// The body is optional: no body means a MEMBER invite.
export const createInviteSchema = z
  .object({ role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER') })
  .default({ role: 'MEMBER' });

export const acceptInviteSchema = z.object({
  code: z.string().trim().min(10, 'Invite code is required').max(64),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;