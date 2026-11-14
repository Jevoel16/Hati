import { Router, type CookieOptions, type Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Ctx } from '../context.js';
import { rateLimit } from '../middleware/guards.js';
import { currentAuth, SESSION_COOKIE, sessionCookieOptions } from '../middleware/session.js';
import { notFound } from '../errors.js';
import * as auth from '../services/auth.js';
import { DEMO_ACCOUNT } from '../services/demo.js';
import { authorizationUrl, createPkce, fetchProfile, isProvider } from '../services/oauth.js';
import * as schemas from './schemas.js';

const OAUTH_COOKIE = 'hati_oauth';
const OAUTH_MAX_AGE_SECONDS = 600;
// Only same-site paths may be used as the post-login destination (no open redirect).
const SAFE_NEXT_PATH = /^\/(?!\/)[\w\-/]*$/;

type OAuthState = { state: string; verifier: string; provider: string; next: string };

export function authRoutes(ctx: Ctx): Router {
  const { config } = ctx;
  const router = Router();
  const limit = rateLimit(ctx, { name: 'auth', limit: ctx.authLimit, windowSeconds: 60 });
  const oauthCookieOptions: CookieOptions = {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: OAUTH_MAX_AGE_SECONDS * 1000,
  };

  const startSession = (res: Response, token: string) =>
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(config));

  router.get('/providers', (_req, res) => {
    res.json({
      google: Boolean(config.google),
      github: Boolean(config.github),
      demo: DEMO_ACCOUNT,
    });
  });

  router.get('/me', (_req, res) => {
    const { user, authMethod } = currentAuth(res);
    res.json({ user, authMethod });
  });

  router.post('/sign-in', limit, async (req, res) => {
    const { email, password } = schemas.signIn.parse(req.body);
    startSession(res, await auth.signInWithPassword(ctx, email, password));
    res.status(204).end();
  });

  router.post('/password', limit, async (req, res) => {
    const token = await auth.setPassword(ctx, currentAuth(res), schemas.password.parse(req.body));
    startSession(res, token);
    res.status(204).end();
  });

  router.post('/sign-out', async (_req, res) => {
    await auth.signOut(ctx, currentAuth(res).sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  router.get('/:provider/start', limit, (req, res) => {
    const provider = String(req.params.provider);
    const client = isProvider(provider) ? config[provider] : undefined;
    if (!isProvider(provider) || !client) throw notFound('Sign-in provider');

    const { state, verifier, challenge } = createPkce();
    const requested = typeof req.query.next === 'string' ? req.query.next : '';
    const payload: OAuthState = {
      state,
      verifier,
      provider,
      next: SAFE_NEXT_PATH.test(requested) ? requested : '/groups',
    };
    const cookie = jwt.sign(payload, config.jwtSecret, { expiresIn: OAUTH_MAX_AGE_SECONDS });
    res.cookie(OAUTH_COOKIE, cookie, oauthCookieOptions);
    res.redirect(authorizationUrl(config, provider, client, state, challenge));
  });

  router.get('/:provider/callback', limit, async (req, res) => {
    const provider = String(req.params.provider);
    res.clearCookie(OAUTH_COOKIE, { path: '/api/auth' });
    try {
      const client = isProvider(provider) ? config[provider] : undefined;
      const saved = jwt.verify(req.cookies?.[OAUTH_COOKIE] ?? '', config.jwtSecret, {
        algorithms: ['HS256'],
      }) as OAuthState;
      const { code, state } = req.query;
      if (
        !isProvider(provider) ||
        !client ||
        saved.provider !== provider ||
        typeof code !== 'string' ||
        state !== saved.state
      ) {
        throw new Error('OAuth state did not match.');
      }
      const profile = await fetchProfile(ctx, provider, client, code, saved.verifier);
      startSession(res, await auth.signInWithOAuth(ctx, profile));
      res.redirect(saved.next);
    } catch (error) {
      console.error('OAuth sign-in failed:', error instanceof Error ? error.message : error);
      res.redirect('/sign-in?error=oauth');
    }
  });

  return router;
}
