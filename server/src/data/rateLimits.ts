import type { Queryable } from '../db.js';

// Counts a hit in the current fixed window and returns the new count.
export async function hit(q: Queryable, bucket: string, windowSeconds: number): Promise<number> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  await q.query(
    `INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE hits = hits + 1`,
    [bucket, windowStart],
  );
  const rows = await q.query<{ hits: number }>(
    'SELECT hits FROM rate_limits WHERE bucket = ? AND window_start = ?',
    [bucket, windowStart],
  );
  return rows[0]?.hits ?? 1;
}

export async function removeOld(q: Queryable): Promise<void> {
  await q.query('DELETE FROM rate_limits WHERE window_start < UTC_TIMESTAMP() - INTERVAL 1 DAY');
}
