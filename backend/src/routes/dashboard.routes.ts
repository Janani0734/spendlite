import { Router } from 'express';
import {
  getDashboard,
  getReviewExpenses,
  getTopCategories,
} from '../controllers/dashboard.controller';
import { asyncHandler } from '../utils/asyncHandler';

// Mounted under /companies/:companyId/dashboard, after requireAuth and requireMember.
export const dashboardRouter = Router();

dashboardRouter.get('/', asyncHandler(getDashboard));
dashboardRouter.get('/top-categories', asyncHandler(getTopCategories));
dashboardRouter.get('/review', asyncHandler(getReviewExpenses));