import { prisma } from '../config/db';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { AUTH_COOKIE_NAME } from '../utils/cookies';
import { verifyAccessToken } from '../utils/jwt';

// Reads the JWT from the httpOnly cookie and attaches the user to req.user.
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token: unknown = req.cookies[AUTH_COOKIE_NAME];
  if (typeof token !== 'string' || token.length === 0) {
    throw AppError.unauthorized();
  }

  const userId = verifyAccessToken(token);
  if (!userId) {
    throw AppError.unauthorized('Invalid or expired session');
  }

  // Re-check the DB so a deleted user's old token stops working.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    throw AppError.unauthorized('Invalid or expired session');
  }

  req.user = user;
  next();
});