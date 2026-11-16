import { randomUUID } from 'node:crypto';
import type { Queryable } from '../db.js';
import type { Delta } from '../domain/balances.js';
import type { Category } from '../domain/money.js';
import type { Share } from '../domain/split.js';

export type SplitType = 'equal' | 'exact' | 'percent';
export type Expense = {
  id: string;
  description: string;
  amountCentavos: number;
  category: Category;
  splitType: SplitType;
  spentOn: string;
  paidBy: string;
  createdBy: string;
  createdAt: Date;
};
export type ExpenseWithShares = Expense & { shares: Share[] };
export type ExpenseInput = Omit<Expense, 'id' | 'createdBy' | 'createdAt'>;
export type Settlement = {
  id: string;
  fromUser: string;
  toUser: string;
  createdBy: string;
  amountCentavos: number;
  settledOn: string;
  createdAt: Date;
};
export type SettlementInput = Pick<
  Settlement,
  'fromUser' | 'toUser' | 'amountCentavos' | 'settledOn'
>;

const EXPENSE_COLUMNS = `id, description, amount_centavos AS amountCentavos, category,
  split_type AS splitType, spent_on AS spentOn, paid_by AS paidBy, created_by AS createdBy,
  created_at AS createdAt`;
const SETTLEMENT_COLUMNS = `id, from_user AS fromUser, to_user AS toUser, created_by AS createdBy,
  amount_centavos AS amountCentavos, settled_on AS settledOn, created_at AS createdAt`;

export async function insertExpense(
  q: Queryable,
  groupId: string,
  createdBy: string,
  input: ExpenseInput,
): Promise<string> {
  const id = randomUUID();
  await q.query(
    `INSERT INTO expenses (id, group_id, paid_by, created_by, amount_centavos, category,
       description, split_type, spent_on, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
    [
      id,
      groupId,
      input.paidBy,
      createdBy,
      input.amountCentavos,
      input.category,
      input.description,
      input.splitType,
      input.spentOn,
    ],
  );
  return id;
}

export async function updateExpense(q: Queryable, id: string, input: ExpenseInput): Promise<void> {
  await q.query(
    `UPDATE expenses SET paid_by = ?, amount_centavos = ?, category = ?, description = ?,
       split_type = ?, spent_on = ? WHERE id = ?`,
    [
      input.paidBy,
      input.amountCentavos,
      input.category,
      input.description,
      input.splitType,
      input.spentOn,
      id,
    ],
  );
}

export async function replaceShares(q: Queryable, expenseId: string, shares: Share[]) {
  await q.query('DELETE FROM expense_shares WHERE expense_id = ?', [expenseId]);
  await q.query('INSERT INTO expense_shares (expense_id, user_id, share_centavos) VALUES ?', [
    shares.map((s) => [expenseId, s.userId, s.shareCentavos]),
  ]);
}

// TiDB has no triggers, so the "shares add up to the amount" rule is re-checked from the
// stored rows before the transaction commits.
export async function sharesMatchAmount(q: Queryable, expenseId: string): Promise<boolean> {
  const rows = await q.query<{ matches: number }>(
    `SELECT e.amount_centavos = COALESCE(SUM(s.share_centavos), 0) AS matches
     FROM expenses e LEFT JOIN expense_shares s ON s.expense_id = e.id
     WHERE e.id = ? GROUP BY e.id, e.amount_centavos`,
    [expenseId],
  );
  return Boolean(rows[0]?.matches);
}

export async function findExpense(
  q: Queryable,
  groupId: string,
  id: string,
): Promise<Expense | undefined> {
  const rows = await q.query<Expense>(
    `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE group_id = ? AND id = ?`,
    [groupId, id],
  );
  return rows[0];
}

export async function removeExpense(q: Queryable, id: string): Promise<void> {
  await q.query('DELETE FROM expenses WHERE id = ?', [id]);
}

export async function listExpenses(
  q: Queryable,
  groupId: string,
  limit: number,
  offset: number,
): Promise<ExpenseWithShares[]> {
  const expenses = await q.query<Expense>(
    `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE group_id = ?
     ORDER BY spent_on DESC, created_at DESC, id LIMIT ? OFFSET ?`,
    [groupId, limit, offset],
  );
  if (expenses.length === 0) return [];
  // One query for all the shares on this page, not one per expense.
  const shares = await q.query<Share & { expenseId: string }>(
    `SELECT expense_id AS expenseId, user_id AS userId, share_centavos AS shareCentavos
     FROM expense_shares WHERE expense_id IN (?)`,
    [expenses.map((e) => e.id)],
  );
  return expenses.map((expense) => ({
    ...expense,
    shares: shares
      .filter((s) => s.expenseId === expense.id)
      .map(({ userId, shareCentavos }) => ({ userId, shareCentavos })),
  }));
}

export async function insertSettlement(
  q: Queryable,
  groupId: string,
  createdBy: string,
  input: SettlementInput,
): Promise<string> {
  const id = randomUUID();
  await q.query(
    `INSERT INTO settlements (id, group_id, from_user, to_user, created_by, amount_centavos,
       settled_on, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
    [id, groupId, input.fromUser, input.toUser, createdBy, input.amountCentavos, input.settledOn],
  );
  return id;
}

export async function findSettlement(
  q: Queryable,
  groupId: string,
  id: string,
): Promise<Settlement | undefined> {
  const rows = await q.query<Settlement>(
    `SELECT ${SETTLEMENT_COLUMNS} FROM settlements WHERE group_id = ? AND id = ?`,
    [groupId, id],
  );
  return rows[0];
}

export async function removeSettlement(q: Queryable, id: string): Promise<void> {
  await q.query('DELETE FROM settlements WHERE id = ?', [id]);
}

export async function listSettlements(
  q: Queryable,
  groupId: string,
  limit: number,
  offset: number,
): Promise<Settlement[]> {
  return q.query<Settlement>(
    `SELECT ${SETTLEMENT_COLUMNS} FROM settlements WHERE group_id = ?
     ORDER BY settled_on DESC, created_at DESC, id LIMIT ? OFFSET ?`,
    [groupId, limit, offset],
  );
}

// Once money is recorded in a currency, changing the currency would change what it means.
export async function hasEntries(q: Queryable, groupId: string): Promise<boolean> {
  const rows = await q.query<{ found: number }>(
    `SELECT EXISTS (SELECT 1 FROM expenses WHERE group_id = ?)
         OR EXISTS (SELECT 1 FROM settlements WHERE group_id = ?) AS found`,
    [groupId, groupId],
  );
  return Boolean(rows[0]?.found);
}

// Every movement of money in the group as a signed amount per person.
export async function balanceDeltas(q: Queryable, groupId: string): Promise<Delta[]> {
  return q.query<Delta>(
    `SELECT paid_by AS userId, SUM(amount_centavos) AS deltaCentavos
       FROM expenses WHERE group_id = ? GROUP BY paid_by
     UNION ALL
     SELECT s.user_id, -SUM(s.share_centavos)
       FROM expense_shares s JOIN expenses e ON e.id = s.expense_id
       WHERE e.group_id = ? GROUP BY s.user_id
     UNION ALL
     SELECT from_user, SUM(amount_centavos)
       FROM settlements WHERE group_id = ? GROUP BY from_user
     UNION ALL
     SELECT to_user, -SUM(amount_centavos)
       FROM settlements WHERE group_id = ? GROUP BY to_user`,
    [groupId, groupId, groupId, groupId],
  );
}

export async function totalsByCategory(q: Queryable, groupId: string) {
  return q.query<{ category: Category; totalCentavos: number }>(
    `SELECT category, SUM(amount_centavos) AS totalCentavos
     FROM expenses WHERE group_id = ? GROUP BY category ORDER BY totalCentavos DESC`,
    [groupId],
  );
}

export async function totalsByMonth(q: Queryable, groupId: string) {
  return q.query<{ month: string; totalCentavos: number }>(
    `SELECT DATE_FORMAT(spent_on, '%Y-%m') AS month, SUM(amount_centavos) AS totalCentavos
     FROM expenses
     WHERE group_id = ?
       AND spent_on >= DATE_SUB(DATE_FORMAT(UTC_DATE(), '%Y-%m-01'), INTERVAL 11 MONTH)
     GROUP BY month ORDER BY month DESC`,
    [groupId],
  );
}
