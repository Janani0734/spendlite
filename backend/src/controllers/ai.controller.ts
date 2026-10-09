import type { Request, Response } from 'express';
import type { AutoCategorizeInput } from '../schemas/ai.schema';
import * as categorizeService from '../services/categorize.service';
import { sendSuccess } from '../utils/apiResponse';

export async function autoCategorize(req: Request, res: Response): Promise<void> {
  const suggestion = await categorizeService.suggestCategory(req.body as AutoCategorizeInput);
  sendSuccess(res, suggestion);
}