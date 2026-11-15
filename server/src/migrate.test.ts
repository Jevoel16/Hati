import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from './migrate.js';
import { skip, startTestApp } from './testing.js';

describe('migrations', { skip }, () => {
  let app: Awaited<ReturnType<typeof startTestApp>>;
  before(async () => {
    app = await startTestApp();
  });
  after(() => app.stop());

  // A deploy or dev restart can stop a migration halfway; running it again must finish it.
  it('re-runs the username migration after an interruption', async () => {
    await app.ctx.db.query("DELETE FROM schema_migrations WHERE name = '002_username.sql'");
    assert.deepEqual(await migrate(app.ctx.db), ['002_username.sql']);
  });
});
