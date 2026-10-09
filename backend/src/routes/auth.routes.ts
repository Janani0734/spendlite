import { Router } from 'express';
import { login, logout, me, signup } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { loginSchema, signupSchema } from '../schemas/auth.schema';
import { asyncHandler } from '../utils/asyncHandler';

export const authRouter = Router();

authRouter.post('/signup', validateBody(signupSchema), asyncHandler(signup));
authRouter.post('/login', validateBody(loginSchema), asyncHandler(login));
authRouter.post('/logout', logout);
authRouter.get('/me', requireAuth, me);