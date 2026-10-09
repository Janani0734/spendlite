import type { Request, Response } from 'express';
import type { AcceptInviteInput, CreateInviteInput } from '../schemas/invite.schema';
import * as inviteService from '../services/invite.service';
import { sendSuccess } from '../utils/apiResponse';
import { getAuthUser, getMembership } from '../utils/requestContext';

export async function createInvite(req: Request, res: Response): Promise<void> {
  const user = getAuthUser(req);
  const membership = getMembership(req);
  const input = req.body as CreateInviteInput;
  const invite = await inviteService.createInvite(membership.companyId, user.id, input.role);
  sendSuccess(res, { invite }, 201);
}

export async function acceptInvite(req: Request, res: Response): Promise<void> {
  const user = getAuthUser(req);
  const input = req.body as AcceptInviteInput;
  const company = await inviteService.acceptInvite(user.id, input.code);
  sendSuccess(res, { company });
}