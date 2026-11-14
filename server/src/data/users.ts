import { randomUUID } from 'node:crypto';
import type { Queryable } from '../db.js';
import type { AccountStatus } from '../domain/machines.js';

export type User = {
  id: string;
  name: string;
  email: string;
  status: AccountStatus;
  isDemo: boolean;
};
export type UserWithHash = User & { passwordHash: string | null };
export type ProviderColumn = 'google_sub' | 'github_id';

type UserRow = Omit<UserWithHash, 'isDemo'> & { isDemo: number };

const COLUMNS = `id, name, email, status, is_demo AS isDemo, password_hash AS passwordHash`;

// TiDB returns BOOLEAN as 0 or 1.
const toUser = (row: UserRow): UserWithHash => ({ ...row, isDemo: Boolean(row.isDemo) });

async function findOne(q: Queryable, where: string, value: string) {
  const rows = await q.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE ${where} = ?`, [value]);
  return rows[0] && toUser(rows[0]);
}

export const findById = (q: Queryable, id: string) => findOne(q, 'id', id);
export const findByEmail = (q: Queryable, email: string) => findOne(q, 'email', email);
// `column` is one of two literals, never user input.
export const findByProvider = (q: Queryable, column: ProviderColumn, providerId: string) =>
  findOne(q, column, providerId);

export async function create(
  q: Queryable,
  input: {
    name: string;
    email: string;
    column?: ProviderColumn;
    providerId?: string;
    isDemo?: boolean;
  },
): Promise<string> {
  const id = randomUUID();
  await q.query(
    `INSERT INTO users (id, name, email, is_demo, email_verified_at, created_at)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
    [id, input.name, input.email, input.isDemo ?? false],
  );
  if (input.column && input.providerId) await linkProvider(q, id, input.column, input.providerId);
  return id;
}

export async function linkProvider(
  q: Queryable,
  userId: string,
  column: ProviderColumn,
  providerId: string,
): Promise<void> {
  await q.query(`UPDATE users SET ${column} = ? WHERE id = ?`, [providerId, userId]);
}

export async function setPassword(
  q: Queryable,
  userId: string,
  passwordHash: string,
  status: AccountStatus,
): Promise<void> {
  await q.query('UPDATE users SET password_hash = ?, status = ? WHERE id = ?', [
    passwordHash,
    status,
    userId,
  ]);
}
