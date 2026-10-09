import { Router } from 'express';
import { authRouter } from './auth.routes';
import { companyRouter } from './company.routes';
import { healthRouter } from './health.routes';
import { inviteRouter } from './invite.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/companies', companyRouter);
apiRouter.use('/invites', inviteRouter);