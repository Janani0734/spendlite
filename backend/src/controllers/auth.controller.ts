import type { Request, Response } from 'express';
import type { LoginInput, SignupInput } from '../schemas/auth.schema';
import * as authService from '../services/auth.service';
import { sendSuccess } from '../utils/apiResponse';
import { AppError } from '../utils/AppError';
import { clearAuthCookie, setAuthCookie } from '../utils/cookies';
import { signAccessToken } from '../utils/jwt';

export async function signup(req: Request, res: Response): Promise<void> {
  const user = await authService.signup(req.body as SignupInput);
  setAuthCookie(res, signAccessToken(user.id));
  sendSuccess(res, { user }, 201);
}

export async function login(req: Request, res: Response): Promise<void> {
  const user = await authService.login(req.body as LoginInput);
  setAuthCookie(res, signAccessToken(user.id));
  sendSuccess(res, { user });
}

export function logout(_req: Request, res: Response): void {
  clearAuthCookie(res);
  sendSuccess(res, { loggedOut: true });
}

export function me(req: Request, res: Response): void {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  sendSuccess(res, { user: req.user });
}