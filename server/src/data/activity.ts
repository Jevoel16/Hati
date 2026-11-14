import type { Queryable } from '../db.js';

export type Action =
  | 'group_created'
  | 'group_renamed'
  | 'member_joined'
  | 'member_left'
  | 'member_removed'
  | 'role_changed'
  | 'expense_added'
  | 'expense_edited'
  | 'expense_deleted'
  | 'settlement_added'
  | 'settlement_deleted';

export type GroupEvent = { id: number; groupId: string; action: Action | 'group_deleted' };
export type ActivityEntry = {
  id: number;
  actorName: string;
  action: Action;
  summary: string;
  createdAt: Date;
};

// Written in the same transaction as the change, so an event exists only if the change did.
export async function publish(
  q: Queryable,
  groupId: string,
  action: GroupEvent['action'],
): Promise<void> {
  await q.query(
    'INSERT INTO group_events (group_id, action, created_at) VALUES (?, ?, UTC_TIMESTAMP(3))',
    [groupId, action],
  );
}

export async function record(
  q: Queryable,
  entry: { groupId: string; actorId: string; action: Action; summary: string },
): Promise<void> {
  await q.query(
    `INSERT INTO activity_log (group_id, actor_id, action, summary, created_at)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))`,
    [entry.groupId, entry.actorId, entry.action, entry.summary],
  );
  await publish(q, entry.groupId, entry.action);
}

export async function list(
  q: Queryable,
  groupId: string,
  limit: number,
  offset: number,
): Promise<ActivityEntry[]> {
  // Ordered by time: TiDB auto-increment ids are unique but not strictly increasing.
  return q.query<ActivityEntry>(
    `SELECT a.id, u.name AS actorName, a.action, a.summary, a.created_at AS createdAt
     FROM activity_log a JOIN users u ON u.id = a.actor_id
     WHERE a.group_id = ?
     ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`,
    [groupId, limit, offset],
  );
}

// Events from the last few seconds. Callers de-duplicate by id, which is why the window
// overlaps the polling interval: a slow commit is still picked up on the next poll.
export async function recentEvents(q: Queryable, windowSeconds: number): Promise<GroupEvent[]> {
  return q.query<GroupEvent>(
    `SELECT id, group_id AS groupId, action FROM group_events
     WHERE created_at > UTC_TIMESTAMP(3) - INTERVAL ? SECOND ORDER BY id LIMIT 500`,
    [windowSeconds],
  );
}

export async function removeOldEvents(q: Queryable): Promise<void> {
  await q.query('DELETE FROM group_events WHERE created_at < UTC_TIMESTAMP(3) - INTERVAL 1 DAY');
}
