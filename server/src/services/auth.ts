import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Ctx } from '../context.js';
import type { Queryable } from '../db.js';
import * as sessions from '../data/sessions.js';
import type { SessionWithUser } from '../data/sessions.js';
import * as users from '../data/users.js';
import { transitionAccount } from '../domain/machines.js';
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  setupRequired,
  unauthorized,
} from '../errors.js';
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

function checkPasswordBytes(password: string) {
  if (Buffer.byteLength(password) > PASSWORD_MAX_BYTES) {
    throw badRequest('Check the password.', { password: 'Use 72 characters or fewer.' });
  }
}

// Every session is dropped and a fresh one issued, so a stolen cookie stops working the
// moment the password changes.
async function rotateSessions(
  ctx: Ctx,
  auth: SessionWithUser,
  write: (tx: Queryable) => Promise<void>,
): Promise<string> {
  const sessionId = await ctx.db.transaction(async (tx) => {
    await write(tx);
    await sessions.removeAllForUser(tx, auth.user.id);
    return sessions.create(tx, auth.user.id, auth.authMethod);
  });
  return signSessionToken(sessionId, ctx.config.jwtSecret);
}

const usernameTaken = () =>
  new AppError(409, 'conflict', 'Check the username.', {
    username: 'That username is taken. Try another.',
  });

// Finishes a new account: a username, plus the first password for an OAuth sign-up.
// Returns a new session token when the password was set, otherwise null.
export async function completeSetup(
  ctx: Ctx,
  auth: SessionWithUser,
  input: { username: string; password?: string },
): Promise<string | null> {
  const user = await users.findById(ctx.db, auth.user.id);
  if (!user) throw unauthorized();
  try {
    switch (user.status) {
      case 'active':
        throw conflict('Your account is already set up.');
      case 'username_pending':
        await users.completeSetup(ctx.db, user.id, {
          username: input.username,
          status: transitionAccount(user.status, 'username_set'),
        });
        return null;
      case 'password_pending': {
        if (!input.password) {
          throw badRequest('Check the password.', {
            password: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
          });
        }
        checkPasswordBytes(input.password);
        const status = transitionAccount(user.status, 'setup_completed');
        const passwordHash = await bcrypt.hash(input.password, ctx.hashCost);
        return await rotateSessions(ctx, auth, (tx) =>
          users.completeSetup(tx, user.id, { username: input.username, passwordHash, status }),
        );
      }
    }
  } catch (error) {
    throw users.isDuplicateKey(error) ? usernameTaken() : error;
  }
}

// Changes the password of a set-up account.
export async function setPassword(
  ctx: Ctx,
  auth: SessionWithUser,
  input: { password: string; currentPassword?: string },
): Promise<string> {
  const user = await users.findById(ctx.db, auth.user.id);
  if (!user) throw unauthorized();
  if (user.isDemo) throw forbidden('The demo account password cannot be changed.');
  if (user.status !== 'active') throw setupRequired();
  checkPasswordBytes(input.password);

  // A session that just came back from Google or GitHub may reset a forgotten password.
  if (auth.authMethod !== 'oauth') {
    const matches = await bcrypt.compare(input.currentPassword ?? '', user.passwordHash ?? '');
    if (!matches) {
      throw badRequest('Check the password.', {
        currentPassword: 'That is not your current password.',
      });
    }
  }
  const nextStatus = transitionAccount(user.status, 'password_changed');
  const passwordHash = await bcrypt.hash(input.password, ctx.hashCost);
  return rotateSessions(ctx, auth, (tx) =>
    users.setPassword(tx, user.id, passwordHash, nextStatus),
  );
}

export const signOut = (ctx: Ctx, sessionId: string) => sessions.remove(ctx.db, sessionId);
