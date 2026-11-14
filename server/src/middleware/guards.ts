import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { Config } from '../config.js';
import type { Ctx } from '../context.js';
import * as rateLimits from '../data/rateLimits.js';
import type { SessionWithUser } from '../data/sessions.js';
import { AppError, forbidden } from '../errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// CSRF defence next to the SameSite cookie: a browser always sends Origin on cross-site
// writes, so a write is accepted only when Origin is this site.
export function isAllowedOrigin(
  config: Config,
  origin: string | undefined,
  host: string | string[] | undefined,
): boolean {
  if (!origin) return false;
  if (origin === config.appUrl) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const requireSameOrigin =
  (config: Config): RequestHandler =>
  (req, _res, next) => {
    const host = req.headers['x-forwarded-host'] ?? req.headers.host;
    if (!SAFE_METHODS.has(req.method) && !isAllowedOrigin(config, req.headers.origin, host)) {
      throw forbidden('Cross-site request blocked.');
    }
    next();
  };

// Counted in the database because serverless instances do not share memory.
export const rateLimit =
  (
    ctx: Ctx,
    options: { name: string; limit: number; windowSeconds: number; writesOnly?: boolean },
  ): RequestHandler =>
  async (req, res, next) => {
    if (options.writesOnly && SAFE_METHODS.has(req.method)) return next();
    const auth = res.locals.auth as SessionWithUser | undefined;
    const who = auth?.user.id ?? req.ip ?? 'unknown';
    const hits = await rateLimits.hit(ctx.db, `${options.name}:${who}`, options.windowSeconds);
    if (hits > options.limit) {
      res.set('Retry-After', String(options.windowSeconds));
      throw new AppError(429, 'rate_limited', 'Too many attempts. Wait a minute and try again.');
    }
    next();
  };

type ErrorBody = { code: string; message: string; fields?: Record<string, string> };

function toResponse(error: unknown): { status: number; body: ErrorBody } {
  if (error instanceof AppError) {
    const { status, code, message, fields } = error;
    return { status, body: { code, message, fields } };
  }
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) fields[issue.path.join('.') || 'body'] ??= issue.message;
    return {
      status: 400,
      body: { code: 'validation_error', message: 'Check the highlighted fields.', fields },
    };
  }
  // express.json() failures: body too large or not valid JSON.
  const type = (error as { type?: string } | null)?.type;
  if (type === 'entity.too.large') {
    return { status: 413, body: { code: 'too_large', message: 'That request is too large.' } };
  }
  if (type === 'entity.parse.failed') {
    return {
      status: 400,
      body: { code: 'bad_json', message: 'The request body is not valid JSON.' },
    };
  }
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  return {
    status: 500,
    body: { code: 'internal_error', message: 'Something went wrong on our side. Try again.' },
  };
}

// The one place errors become responses. Every error has the same shape; no stack traces leave.
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const { status, body } = toResponse(error);
  res.status(status).json({ error: body });
};
