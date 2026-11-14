import type { CookieOptions, RequestHandler, Response } from 'express';
import type { Config } from '../config.js';
import type { Ctx } from '../context.js';
import type { SessionWithUser } from '../data/sessions.js';
import { AppError, unauthorized } from '../errors.js';
import { resolveSession, TOKEN_MAX_AGE_SECONDS } from '../services/auth.js';

export const SESSION_COOKIE = 'hati_session';

// httpOnly keeps the token away from scripts; Lax stops other sites sending it on POSTs.
export const sessionCookieOptions = (config: Config): CookieOptions => ({
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'lax',
  path: '/',
  maxAge: TOKEN_MAX_AGE_SECONDS * 1000,
});

export const loadSession =
  (ctx: Ctx): RequestHandler =>
  async (req, res, next) => {
    res.locals.auth = await resolveSession(ctx, req.cookies?.[SESSION_COOKIE]);
    next();
  };

export function currentAuth(res: Response): SessionWithUser {
  const auth = res.locals.auth as SessionWithUser | undefined;
  if (!auth) throw unauthorized();
  return auth;
}

export const currentUser = (res: Response) => currentAuth(res).user;

// An account that has not set its password yet may only do that, or sign out.
export const requireActive: RequestHandler = (_req, res, next) => {
  if (currentUser(res).status !== 'active') {
    throw new AppError(403, 'password_required', 'Set a password to continue.');
  }
  next();
};
