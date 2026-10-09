import type { Request, Response } from 'express';
import type { CreateCompanyInput } from '../schemas/company.schema';
import * as companyService from '../services/company.service';
import { sendSuccess } from '../utils/apiResponse';
import { getAuthUser, getMembership } from '../utils/requestContext';

export async function createCompany(req: Request, res: Response): Promise<void> {
  const user = getAuthUser(req);
  const company = await companyService.createCompany(user.id, req.body as CreateCompanyInput);
  sendSuccess(res, { company }, 201);
}

export async function listCompanies(req: Request, res: Response): Promise<void> {
  const user = getAuthUser(req);
  const companies = await companyService.listCompanies(user.id);
  sendSuccess(res, { companies });
}

export async function getCompany(req: Request, res: Response): Promise<void> {
  const membership = getMembership(req);
  const company = await companyService.getCompany(membership.companyId, membership.role);
  sendSuccess(res, { company });
}