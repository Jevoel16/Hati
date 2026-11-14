import { timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer, type Server } from 'node:http';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Ctx } from './context.js';
import * as activity from './data/activity.js';
import * as rateLimits from './data/rateLimits.js';
import * as sessions from './data/sessions.js';
import { notFound, unauthorized } from './errors.js';
import { errorHandler, rateLimit, requireSameOrigin } from './middleware/guards.js';
import { loadSession, requireActive } from './middleware/session.js';
import { authRoutes } from './routes/auth.js';
import { groupRoutes } from './routes/groups.js';
import { attachLive } from './routes/live.js';
import { resetDemo } from './services/demo.js';

function isCronRequest(ctx: Ctx, header: string | undefined): boolean {
  const expected = Buffer.from(`Bearer ${ctx.config.cronSecret ?? ''}`);
  const given = Buffer.from(header ?? '');
  return (
    Boolean(ctx.config.cronSecret) &&
    given.length === expected.length &&
    timingSafeEqual(given, expected)
  );
}

// All the wiring between the pieces lives here, in the order a request passes through it.
export function createApp(ctx: Ctx): Express {
  const app = express();
  app.disable('x-powered-by');
  // One proxy (Vercel, or Vite in development) sits in front, so req.ip is the real client.
  app.set('trust proxy', 1);
  app.use(
    helmet({
      // The API only returns JSON, so nothing may load or frame it.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    await ctx.db.query('SELECT 1');
    res.json({ status: 'ok' });
  });

  // Called once a day by Vercel Cron: resets the demo and prunes expired rows.
  app.get('/api/cron/daily', async (req, res) => {
    if (!isCronRequest(ctx, req.headers.authorization)) throw unauthorized();
    await resetDemo(ctx);
    await sessions.removeExpired(ctx.db);
    await rateLimits.removeOld(ctx.db);
    await activity.removeOldEvents(ctx.db);
    res.json({ status: 'ok' });
  });

  app.use('/api', requireSameOrigin(ctx.config), loadSession(ctx));
  app.use('/api/auth', authRoutes(ctx));
  app.use(
    '/api',
    requireActive,
    rateLimit(ctx, { name: 'write', limit: 60, windowSeconds: 60, writesOnly: true }),
    groupRoutes(ctx),
  );
  app.use('/api', () => {
    throw notFound('Endpoint');
  });
  app.use(errorHandler);
  return app;
}

export function createServer(ctx: Ctx): { server: Server; close(): Promise<void> } {
  const server = createHttpServer(createApp(ctx));
  const live = attachLive(server, ctx);
  return {
    server,
    async close() {
      live.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
