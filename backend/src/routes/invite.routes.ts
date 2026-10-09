import { Router } from 'express';
import { acceptInvite } from '../controllers/invite.controller';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { acceptInviteSchema } from '../schemas/invite.schema';
import { asyncHandler } from '../utils/asyncHandler';

export const inviteRouter = Router();

inviteRouter.post('/accept', requireAuth, validateBody(acceptInviteSchema), asyncHandler(acceptInvite));