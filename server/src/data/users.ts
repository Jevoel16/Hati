import { randomUUID } from 'node:crypto';
import type { Queryable } from '../db.js';
import type { AccountStatus } from '../domain/machines.js';

export type User = {
  id: string;
  name: string;
  username: string | null;
  email: string;
  status: AccountStatus;
  isDemo: boolean;
  // Finished or skipped the guided tour (users.onboarded_at is set).
  onboarded: boolean;
};
export type UserWithHash = User & { passwordHash: string | null };
export type ProviderColumn = 'google_sub' | 'github_id';

type UserRow = Omit<UserWithHash, 'isDemo' | 'onboarded'> & { isDemo: number; onboarded: number };

const COLUMNS = `id, name, username, email, status, is_demo AS isDemo,
  onboarded_at IS NOT NULL AS onboarded, password_hash AS passwordHash`;

// TiDB returns BOOLEAN as 0 or 1.
const toUser = (row: UserRow): UserWithHash => ({
  ...row,
  isDemo: Boolean(row.isDemo),
  onboarded: Boolean(row.onboarded),
});

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

// mysql2 reports a unique key clash as errno 1062.
export const isDuplicateKey = (error: unknown) =>
  (error as { errno?: number } | null)?.errno === 1062;

// Ends account setup: the username, plus the first password when the account had none.
export async function completeSetup(
  q: Queryable,
  userId: string,
  input: { username: string; passwordHash?: string; status: AccountStatus },
): Promise<void> {
  await q.query(
    'UPDATE users SET username = ?, password_hash = COALESCE(?, password_hash), status = ? WHERE id = ?',
    [input.username, input.passwordHash ?? null, input.status, userId],
  );
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

// Keeps the first time, so finishing a replayed tour does not move it.
export async function markOnboarded(q: Queryable, userId: string): Promise<void> {
  await q.query(
    'UPDATE users SET onboarded_at = COALESCE(onboarded_at, UTC_TIMESTAMP(3)) WHERE id = ?',
    [userId],
  );
}

export type PaymentQrRow = { id: string; label: string; payload: string };

// Oldest first, so a member's first method stays at the top.
export async function listPaymentQrs(q: Queryable, userId: string): Promise<PaymentQrRow[]> {
  return q.query<PaymentQrRow>(
    'SELECT id, label, payload FROM payment_qrs WHERE user_id = ? ORDER BY created_at, label',
    [userId],
  );
}

export async function addPaymentQr(
  q: Queryable,
  userId: string,
  qr: { label: string; payload: string },
): Promise<string> {
  const id = randomUUID();
  await q.query(
    `INSERT INTO payment_qrs (id, user_id, label, payload, created_at)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))`,
    [id, userId, qr.label, qr.payload],
  );
  return id;
}

// Scoped to the owner, so nobody can remove another member's QR by guessing its id.
export async function removePaymentQr(q: Queryable, userId: string, id: string): Promise<void> {
  await q.query('DELETE FROM payment_qrs WHERE id = ? AND user_id = ?', [id, userId]);
}

export async function removeAllPaymentQrs(q: Queryable, userId: string): Promise<void> {
  await q.query('DELETE FROM payment_qrs WHERE user_id = ?', [userId]);
}
