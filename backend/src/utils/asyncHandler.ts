import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Wraps an async handler so any rejection is forwarded to the error middleware.
 * Express 5 already does this natively; the wrapper keeps the intent explicit
 * and stays safe if a handler is ever reused on an older Express.
 */
export const asyncHandler =
  (handler: AsyncRequestHandler): RequestHandler =>
  (req, res, next) => {
    handler(req, res, next).catch(next);
  };