import type { Request, RequestHandler, Response } from 'express';
import type { PublicUser } from '../domain/types.js';
import { ForbiddenError, UnauthorizedError } from '../domain/errors.js';
import { hasPermission, type Permission } from '../domain/permissions.js';
import type { AuthService } from '../services/auth.service.js';
import { asyncHandler } from './error-handler.js';
import { readCookie, SESSION_COOKIE } from './security.js';

export function bearerToken(req: Request): string | null {
  const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
  return scheme === 'Bearer' && token ? token : null;
}

/** Browsers send the httpOnly session cookie; scripts and tests may still use a bearer token. */
export const sessionToken = (req: Request): string | null => bearerToken(req) ?? readCookie(req, SESSION_COOKIE);

/** Resolves the session and stores the user in res.locals for later handlers. */
export const authenticate = (auth: AuthService): RequestHandler =>
  asyncHandler(async (req, res) => {
    const token = sessionToken(req);
    if (!token) throw new UnauthorizedError();
    res.locals.user = await auth.authenticate(token);
  }, { next: true });

export const currentUser = (res: Response): PublicUser => {
  const user = res.locals.user as PublicUser | undefined;
  if (!user) throw new UnauthorizedError();
  return user;
};

export const requirePermission =
  (permission: Permission): RequestHandler =>
  (_req, res, next) => {
    next(hasPermission(currentUser(res).role, permission) ? undefined : new ForbiddenError());
  };
