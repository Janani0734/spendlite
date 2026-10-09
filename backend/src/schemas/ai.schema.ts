import { z } from 'zod';

export const autoCategorizeSchema = z.object({
  description: z.string().trim().min(1, 'Description is required').max(500),
  merchant: z.string().trim().max(100).nullable().optional(),
});

export type AutoCategorizeInput = z.infer<typeof autoCategorizeSchema>;