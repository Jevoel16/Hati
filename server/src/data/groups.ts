import { randomUUID } from 'node:crypto';
import type { Queryable } from '../db.js';
import type { MemberStatus } from '../domain/machines.js';

export type Role = 'admin' | 'member';
export type Group = { id: string; name: string; inviteCode: string; createdByDemo: boolean };
export type Membership = { role: Role; status: MemberStatus };
export type Member = {
  userId: string;
  name: string;
  role: Role;
  status: MemberStatus;
  // Whether they saved a payment QR; the QR itself is only sent with an amount.
  hasPaymentQr: boolean;
};
export type GroupListItem = {
  id: string;
  name: string;
  role: Role;
  memberCount: number;
  netCentavos: number;
};

// GROUPS is a reserved word in TiDB, so the table name is always quoted.
const GROUPS = '`groups`';
const GROUP_SELECT = `SELECT g.id, g.name, g.invite_code AS inviteCode, u.is_demo AS createdByDemo
  FROM ${GROUPS} g JOIN users u ON u.id = g.created_by`;

type GroupRow = Omit<Group, 'createdByDemo'> & { createdByDemo: number };
const toGroup = (row?: GroupRow): Group | undefined =>
  row && { ...row, createdByDemo: Boolean(row.createdByDemo) };

export async function insert(
  q: Queryable,
  input: { name: string; inviteCode: string; createdBy: string },
): Promise<string> {
  const id = randomUUID();
  await q.query(
    `INSERT INTO ${GROUPS} (id, name, invite_code, created_by, created_at)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))`,
    [id, input.name, input.inviteCode, input.createdBy],
  );
  return id;
}

export async function findById(q: Queryable, id: string): Promise<Group | undefined> {
  return toGroup((await q.query<GroupRow>(`${GROUP_SELECT} WHERE g.id = ?`, [id]))[0]);
}

export async function findByInviteCode(q: Queryable, code: string): Promise<Group | undefined> {
  return toGroup((await q.query<GroupRow>(`${GROUP_SELECT} WHERE g.invite_code = ?`, [code]))[0]);
}

export async function listForUser(q: Queryable, userId: string): Promise<GroupListItem[]> {
  return q.query<GroupListItem>(
    `SELECT g.id, g.name, m.role,
       (SELECT COUNT(*) FROM group_members x
         WHERE x.group_id = g.id AND x.status = 'active') AS memberCount,
       (
         COALESCE((SELECT SUM(e.amount_centavos) FROM expenses e
                    WHERE e.group_id = g.id AND e.paid_by = ?), 0)
         - COALESCE((SELECT SUM(s.share_centavos) FROM expense_shares s
                      JOIN expenses e ON e.id = s.expense_id
                      WHERE e.group_id = g.id AND s.user_id = ?), 0)
         + COALESCE((SELECT SUM(t.amount_centavos) FROM settlements t
                      WHERE t.group_id = g.id AND t.from_user = ?), 0)
         - COALESCE((SELECT SUM(t.amount_centavos) FROM settlements t
                      WHERE t.group_id = g.id AND t.to_user = ?), 0)
       ) AS netCentavos
     FROM ${GROUPS} g
     JOIN group_members m ON m.group_id = g.id AND m.user_id = ? AND m.status = 'active'
     ORDER BY g.created_at DESC
     LIMIT 100`,
    [userId, userId, userId, userId, userId],
  );
}

export async function rename(q: Queryable, id: string, name: string): Promise<void> {
  await q.query(`UPDATE ${GROUPS} SET name = ? WHERE id = ?`, [name, id]);
}

export async function setInviteCode(q: Queryable, id: string, code: string): Promise<void> {
  await q.query(`UPDATE ${GROUPS} SET invite_code = ? WHERE id = ?`, [code, id]);
}

export async function remove(q: Queryable, id: string): Promise<void> {
  await q.query(`DELETE FROM ${GROUPS} WHERE id = ?`, [id]);
}

export async function removeCreatedBy(q: Queryable, userId: string): Promise<void> {
  await q.query(`DELETE FROM ${GROUPS} WHERE created_by = ?`, [userId]);
}

export async function findMembership(
  q: Queryable,
  groupId: string,
  userId: string,
): Promise<Membership | undefined> {
  const rows = await q.query<Membership>(
    'SELECT role, status FROM group_members WHERE group_id = ? AND user_id = ?',
    [groupId, userId],
  );
  return rows[0];
}

export async function listMembers(q: Queryable, groupId: string): Promise<Member[]> {
  const rows = await q.query<Omit<Member, 'hasPaymentQr'> & { hasPaymentQr: number }>(
    `SELECT m.user_id AS userId, u.name, m.role, m.status,
            u.payment_qr IS NOT NULL AS hasPaymentQr
     FROM group_members m JOIN users u ON u.id = m.user_id
     WHERE m.group_id = ?
     ORDER BY m.joined_at, u.name`,
    [groupId],
  );
  // TiDB returns the boolean as 0 or 1.
  return rows.map((row) => ({ ...row, hasPaymentQr: Boolean(row.hasPaymentQr) }));
}

export async function addMember(
  q: Queryable,
  groupId: string,
  userId: string,
  role: Role,
): Promise<void> {
  await q.query(
    `INSERT INTO group_members (group_id, user_id, role, joined_at)
     VALUES (?, ?, ?, UTC_TIMESTAMP(3))`,
    [groupId, userId, role],
  );
}

export async function updateMember(
  q: Queryable,
  groupId: string,
  userId: string,
  changes: Membership,
): Promise<void> {
  await q.query(
    'UPDATE group_members SET role = ?, status = ? WHERE group_id = ? AND user_id = ?',
    [changes.role, changes.status, groupId, userId],
  );
}
