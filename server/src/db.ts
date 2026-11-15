import mysql from 'mysql2/promise';

export interface Queryable {
  // Placeholders (?) only; values are never concatenated into the SQL text.
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const QUERY_TIMEOUT_MS = 10_000;
// Concurrent transactions can deadlock on index gap locks; the database rolls one back and
// asks for a retry (errno 1213). Transaction bodies only touch the database, so a rerun is safe.
const DEADLOCK_ATTEMPTS = 3;
const isDeadlock = (error: unknown) => (error as { errno?: number } | null)?.errno === 1213;

export function connect(url: string): Db {
  const { hostname } = new URL(url);
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const pool = mysql.createPool({
    uri: url,
    connectionLimit: 5,
    idleTimeout: 10_000,
    // TiDB Cloud only accepts TLS connections.
    ssl: isLocal ? undefined : { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    timezone: 'Z',
    dateStrings: ['DATE'],
    decimalNumbers: true,
  });

  const wrap = (runner: mysql.Pool | mysql.PoolConnection): Queryable => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const [rows] = await runner.query({ sql, values: params, timeout: QUERY_TIMEOUT_MS });
      return (Array.isArray(rows) ? rows : []) as T[];
    },
  });

  return {
    ...wrap(pool),
    async transaction(fn) {
      for (let attempt = 1; ; attempt++) {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          const result = await fn(wrap(connection));
          await connection.commit();
          return result;
        } catch (error) {
          await connection.rollback().catch(() => {});
          if (!isDeadlock(error) || attempt === DEADLOCK_ATTEMPTS) throw error;
        } finally {
          connection.release();
        }
      }
    },
    close: () => pool.end(),
  };
}
