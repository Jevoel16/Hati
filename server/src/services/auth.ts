import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Ctx } from '../context.js';
import * as sessions from '../data/sessions.js';
import type { SessionWithUser } from '../data/sessions.js';
import * as users from '../data/users.js';
import { transitionAccount } from '../domain/machines.js';
import { AppError, badRequest, forbidden, unauthorized } from '../errors.js';
import type { Profile } from './oauth.js';

export const TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const PASSWORD_MIN_LENGTH = 10;
// bcrypt ignores everything after 72 bytes.
const PASSWORD_MAX_BYTES = 72;

const invalidCredentials = () =>
  new AppError(401, 'invalid_credentials', 'Email or password is incorrect.');

// The cookie holds a signed JWT that only names a session row, so it can be revoked.
export function signSessionToken(sessionId: string, secret: string): string {
  return jwt.sign({ sid: sessionId }, secret, {
    algorithm: 'HS256',
    expiresIn: TOKEN_MAX_AGE_SECONDS,
  });
}

export function readSessionToken(token: string, secret: string): string | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    return typeof payload === 'object' && typeof payload.sid === 'string' ? payload.sid : null;
  } catch {
    return null;
  }
}

export async function resolveSession(ctx: Ctx, token: string | undefined) {
  const sessionId = token ? readSessionToken(token, ctx.config.jwtSecret) : null;
  return sessionId ? sessions.findAndTouch(ctx.db, sessionId) : undefined;
}

const dummyHashes = new Map<number, string>();
// Compared against when the email is unknown, so both failures take the same time.
function dummyHash(cost: number): string {
  if (!dummyHashes.has(cost)) dummyHashes.set(cost, bcrypt.hashSync('not-a-real-password', cost));
  return dummyHashes.get(cost)!;
}

export async function signInWithPassword(ctx: Ctx, email: string, password: string) {
  const user = await users.findByEmail(ctx.db, email.toLowerCase());
  const matches = await bcrypt.compare(password, user?.passwordHash ?? dummyHash(ctx.hashCost));
  if (!user?.passwordHash || !matches) throw invalidCredentials();
  const sessionId = await sessions.create(ctx.db, user.id, 'password');
  return signSessionToken(sessionId, ctx.config.jwtSecret);
}

// Finds the account for a provider identity, links it by verified email, or creates it.
export async function signInWithOAuth(ctx: Ctx, profile: Profile): Promise<string> {
  const column = profile.provider === 'google' ? 'google_sub' : 'github_id';
  let userId = (await users.findByProvider(ctx.db, column, profile.providerId))?.id;
  if (!userId) {
    const existing = await users.findByEmail(ctx.db, profile.email);
    if (existing) {
      await users.linkProvider(ctx.db, existing.id, column, profile.providerId);
      userId = existing.id;
    } else {
      userId = await users.create(ctx.db, {
        name: profile.name.slice(0, 80),
        email: profile.email,
        column,
        providerId: profile.providerId,
      });
    }
  }
  const sessionId = await sessions.create(ctx.db, userId, 'oauth');
  return signSessionToken(sessionId, ctx.config.jwtSecret);
}

// Sets the first password or changes it. Every session is dropped and a fresh one issued,
// so a stolen cookie stops working the moment the password changes.
export async function setPassword(
  ctx: Ctx,
  auth: SessionWithUser,
  input: { password: string; currentPassword?: string },
): Promise<string> {
  const user = await users.findById(ctx.db, auth.user.id);
  if (!user) throw unauthorized();
  if (user.isDemo) throw forbidden('The demo account password cannot be changed.');
  if (Buffer.byteLength(input.password) > PASSWORD_MAX_BYTES) {
    throw badRequest('Check the password.', { password: 'Use 72 characters or fewer.' });
  }

  const isFirstPassword = user.status === 'password_pending';
  // A session that just came back from Google or GitHub may reset a forgotten password.
  if (!isFirstPassword && auth.authMethod !== 'oauth') {
    const matches = await bcrypt.compare(input.currentPassword ?? '', user.passwordHash ?? '');
    if (!matches) {
      throw badRequest('Check the password.', {
        currentPassword: 'That is not your current password.',
      });
    }
  }
  const nextStatus = transitionAccount(
    user.status,
    isFirstPassword ? 'password_set' : 'password_changed',
  );
  const passwordHash = await bcrypt.hash(input.password, ctx.hashCost);

  const sessionId = await ctx.db.transaction(async (tx) => {
    await users.setPassword(tx, user.id, passwordHash, nextStatus);
    await sessions.removeAllForUser(tx, user.id);
    return sessions.create(tx, user.id, auth.authMethod);
  });
  return signSessionToken(sessionId, ctx.config.jwtSecret);
}

export const signOut = (ctx: Ctx, sessionId: string) => sessions.remove(ctx.db, sessionId);
