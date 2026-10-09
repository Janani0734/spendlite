import type { Request, Response } from 'express';
import {
  dashboardQuerySchema,
  reviewQuerySchema,
  topCategoriesQuerySchema,
} from '../schemas/dashboard.schema';
import * as dashboardService from '../services/dashboard.service';
import { sendSuccess } from '../utils/apiResponse';
import { resolvePeriod } from '../utils/period';
import { getMembership } from '../utils/requestContext';

// A ZodError thrown by .parse() becomes a 400 VALIDATION_ERROR via the error handler.
export async function getDashboard(req: Request, res: Response): Promise<void> {
  const { companyId } = getMembership(req);
  const query = dashboardQuerySchema.parse(req.query);
  const summary = await dashboardService.getDashboard(companyId, resolvePeriod(query));
  sendSuccess(res, summary);
}

export async function getTopCategories(req: Request, res: Response): Promise<void> {
  const { companyId } = getMembership(req);
  const query = topCategoriesQuerySchema.parse(req.query);
  const report = await dashboardService.getTopCategories(
    companyId,
    resolvePeriod(query),
    query.limit,
  );
  sendSuccess(res, report);
}

export async function getReviewExpenses(req: Request, res: Response): Promise<void> {
  const { companyId } = getMembership(req);
  const query = reviewQuerySchema.parse(req.query);
  const report = await dashboardService.getReviewExpenses(
    companyId,
    resolvePeriod(query),
    query.threshold,
    query.limit,
  );
  sendSuccess(res, report);
}