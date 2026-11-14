import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { connect, type Db } from './db.js';

const migrationsDir = join(import.meta.dirname, '../migrations');

// Drops comment lines, then splits on the semicolon that ends each statement.
const statementsOf = (sql: string) =>
  sql
    .replace(/^--.*$/gm, '')
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter(Boolean);

// DDL commits on its own in TiDB, so a migration is recorded only after all of it ran.
export async function migrate(db: Db): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(100) NOT NULL PRIMARY KEY,
    applied_at DATETIME(3) NOT NULL
  )`);
  const applied = new Set(
    (await db.query<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name),
  );
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    for (const statement of statementsOf(await readFile(join(migrationsDir, file), 'utf8'))) {
      await db.query(statement);
    }
    await db.query(
      'INSERT INTO schema_migrations (name, applied_at) VALUES (?, UTC_TIMESTAMP(3))',
      [file],
    );
    ran.push(file);
  }
  return ran;
}

// Run directly (`npm run migrate`); only DATABASE_URL is needed.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  const db = connect(url);
  const ran = await migrate(db);
  console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Database is up to date.');
  await db.close();
}
