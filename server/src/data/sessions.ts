import { randomUUID } from 'node:crypto';
import type { Queryable } from '../db.js';
import type { User } from './users.js';

export type AuthMethod = 'oauth' | 'password';
export type SessionWithUser = { sessionId: string; authMethod: AuthMethod; user: User };

export const SESSION_IDLE_DAYS = 7;

export async function create(q: Queryable, userId: string, method: AuthMethod): Promise<string> {
  const id = randomUUID();
  await q.query(
    `INSERT INTO sessions (id, user_id, auth_method, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3) + INTERVAL ? DAY)`,
    [id, userId, method, SESSION_IDLE_DAYS],
  );
  return id;
}

// Finds a live session and slides its idle expiry, at most once an hour to save writes.
export async function findAndTouch(
  q: Queryable,
  sessionId: string,
): Promise<SessionWithUser | undefined> {
  const rows = await q.query<{
    authMethod: AuthMethod;
    stale: number;
    id: string;
    name: string;
    username: string | null;
    email: string;
    status: User['status'];
    isDemo: number;
  }>(
    `SELECT s.auth_method AS authMethod,
            s.last_seen_at < UTC_TIMESTAMP(3) - INTERVAL 1 HOUR AS stale,
            u.id, u.name, u.username, u.email, u.status, u.is_demo AS isDemo
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > UTC_TIMESTAMP(3)`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) return undefined;
  if (row.stale) {
    await q.query(
      `UPDATE sessions
       SET last_seen_at = UTC_TIMESTAMP(3), expires_at = UTC_TIMESTAMP(3) + INTERVAL ? DAY
       WHERE id = ?`,
      [SESSION_IDLE_DAYS, sessionId],
    );
  }
  return {
    sessionId,
    authMethod: row.authMethod,
    user: {
      id: row.id,
      name: row.name,
      username: row.username,
      email: row.email,
      status: row.status,
      isDemo: Boolean(row.isDemo),
    },
  };
}

export async function remove(q: Queryable, sessionId: string): Promise<void> {
  await q.query('DELETE FROM sessions WHERE id = ?', [sessionId]);
}

export async function removeAllForUser(q: Queryable, userId: string): Promise<void> {
  await q.query('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

export async function removeExpired(q: Queryable): Promise<void> {
  await q.query('DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP(3)');
}
