import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrate } from './migrate.js';
import { DEMO_ACCOUNT } from './services/demo.js';
import { skip, startTestApp } from './testing.js';

const PASSWORD = 'correct-horse-battery';

describe('auth', { skip }, () => {
  let app: Awaited<ReturnType<typeof startTestApp>>;
  before(async () => {
    app = await startTestApp({ cronSecret: 'cron-secret-0123456789' });
  });
  after(() => app.stop());

  it('first OAuth sign-in creates an account that must finish setup', async () => {
    const c = app.client();
    const callback = await app.oauthSignIn(c, 'ana@example.com');
    assert.equal(callback.location, '/groups');

    const me = await c.get('/api/auth/me');
    assert.equal(me.body.user.status, 'password_pending');
    assert.equal(me.body.user.username, null);
    assert.equal(me.body.user.passwordHash, undefined);

    const blocked = await c.get('/api/groups');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, 'setup_required');
    assert.equal((await c.post('/api/auth/password', { password: PASSWORD })).status, 403);
  });

  it('setup needs a valid username and a password, then activates the account', async () => {
    const c = app.client();
    await app.oauthSignIn(c, 'ana@example.com');
    const badName = await c.post('/api/auth/setup', { username: 'a!', password: PASSWORD });
    assert.equal(badName.status, 400);
    assert.ok(badName.body.error.fields.username);

    const noPassword = await c.post('/api/auth/setup', { username: 'ana' });
    assert.equal(noPassword.status, 400);
    assert.ok(noPassword.body.error.fields.password);

    const short = await c.post('/api/auth/setup', { username: 'ana', password: 'short' });
    assert.equal(short.status, 400);
    assert.ok(short.body.error.fields.password);

    const ok = await c.post('/api/auth/setup', { username: ' Ana_1 ', password: PASSWORD });
    assert.equal(ok.status, 204);
    const me = await c.get('/api/auth/me');
    assert.equal(me.body.user.status, 'active');
    assert.equal(me.body.user.username, 'ana_1');
    assert.equal((await c.get('/api/groups')).status, 200);

    const again = await c.post('/api/auth/setup', { username: 'ana_2', password: PASSWORD });
    assert.equal(again.status, 409);
  });

  it('refuses a username someone already has', async () => {
    const c = app.client();
    await app.oauthSignIn(c, 'other@example.com');
    const taken = await c.post('/api/auth/setup', { username: 'ANA_1', password: PASSWORD });
    assert.equal(taken.status, 409);
    assert.ok(taken.body.error.fields.username);
    assert.equal((await c.get('/api/auth/me')).body.user.status, 'password_pending');
  });

  it('an older account without a username only has to choose one', async () => {
    const { client: c } = await app.signUp('dee@example.com');
    await app.ctx.db.query(
      "UPDATE users SET status = 'username_pending', username = NULL WHERE email = ?",
      ['dee@example.com'],
    );
    assert.equal((await c.get('/api/groups')).status, 403);

    assert.equal((await c.post('/api/auth/setup', { username: 'dee_l' })).status, 204);
    const me = await c.get('/api/auth/me');
    assert.equal(me.body.user.status, 'active');
    assert.equal(me.body.user.username, 'dee_l');
    const signIn = await app
      .client()
      .post('/api/auth/sign-in', { email: 'dee@example.com', password: PASSWORD });
    assert.equal(signIn.status, 204);
  });

  it('signs in with the password, and fails the same way for a wrong password or unknown email', async () => {
    const c = app.client();
    const ok = await c.post('/api/auth/sign-in', { email: 'Ana@Example.com', password: PASSWORD });
    assert.equal(ok.status, 204);

    const wrong = await app
      .client()
      .post('/api/auth/sign-in', { email: 'ana@example.com', password: 'wrong-password' });
    const unknown = await app
      .client()
      .post('/api/auth/sign-in', { email: 'nobody@example.com', password: PASSWORD });
    assert.equal(wrong.status, 401);
    assert.deepEqual(wrong.body, unknown.body);
  });

  it('sign-out ends the session on the server, not just in the browser', async () => {
    const c = app.client();
    await c.post('/api/auth/sign-in', { email: 'ana@example.com', password: PASSWORD });
    const stolenCookie = c.cookieHeader();
    assert.equal((await c.post('/api/auth/sign-out')).status, 204);

    const replay = await fetch(`${app.baseUrl}/api/auth/me`, { headers: { cookie: stolenCookie } });
    assert.equal(await replay.json(), null);
  });

  it('changing the password needs the current one and signs out other sessions', async () => {
    const { client: first } = await app.signUp('ben@example.com');
    const second = app.client();
    await second.post('/api/auth/sign-in', { email: 'ben@example.com', password: PASSWORD });

    const wrong = await second.post('/api/auth/password', {
      password: 'another-long-password',
      currentPassword: 'not-it',
    });
    assert.equal(wrong.status, 400);

    const changed = await second.post('/api/auth/password', {
      password: 'another-long-password',
      currentPassword: PASSWORD,
    });
    assert.equal(changed.status, 204);
    assert.ok((await second.get('/api/auth/me')).body);
    assert.equal((await first.get('/api/auth/me')).body, null);
  });

  it('refuses an OAuth account whose email is not verified', async () => {
    const c = app.client();
    const callback = await app.oauthSignIn(c, 'unverified@example.com');
    assert.equal(callback.location, '/sign-in?error=oauth');
    assert.equal((await c.get('/api/auth/me')).body, null);
  });

  it('refuses an OAuth callback whose state does not match', async () => {
    const c = app.client();
    await c.get('/api/auth/google/start');
    const callback = await c.get('/api/auth/google/callback?code=eve@example.com&state=forged');
    assert.equal(callback.location, '/sign-in?error=oauth');
    assert.equal((await c.get('/api/auth/me')).body, null);
  });

  it('links GitHub to the existing account with the same verified email', async () => {
    const google = app.client();
    await app.oauthSignIn(google, 'ana@example.com', 'google');
    const github = app.client();
    await app.oauthSignIn(github, 'ana@example.com', 'github');
    assert.equal(
      (await github.get('/api/auth/me')).body.user.id,
      (await google.get('/api/auth/me')).body.user.id,
    );
  });

  it('only redirects to paths on this site after sign-in', async () => {
    const safe = await app.oauthSignIn(app.client(), 'ana@example.com', 'google', '/join/ABCDEFGH');
    assert.equal(safe.location, '/join/ABCDEFGH');
    const evil = await app.oauthSignIn(app.client(), 'ana@example.com', 'google', '//evil.example');
    assert.equal(evil.location, '/groups');
  });

  it('blocks a write sent from another site', async () => {
    const c = app.client();
    await c.post('/api/auth/sign-in', { email: 'ana@example.com', password: PASSWORD });
    const forged = await c.request('POST', '/api/groups', { name: 'x' }, 'https://evil.example');
    assert.equal(forged.status, 403);
  });

  it('answers unknown API paths with the standard error shape', async () => {
    const c = app.client();
    await c.post('/api/auth/sign-in', { email: 'ana@example.com', password: PASSWORD });
    const missing = await c.get('/api/nope');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'not_found');
  });

  it('the daily cron needs its secret and resets the demo account', async () => {
    const denied = await fetch(`${app.baseUrl}/api/cron/daily`);
    assert.equal(denied.status, 401);

    const ran = await fetch(`${app.baseUrl}/api/cron/daily`, {
      headers: { authorization: 'Bearer cron-secret-0123456789' },
    });
    assert.equal(ran.status, 200);

    const demo = app.client();
    assert.equal((await demo.post('/api/auth/sign-in', DEMO_ACCOUNT)).status, 204);
    const { groups } = (await demo.get('/api/groups')).body;
    assert.equal(groups.length, 1);
    assert.equal(groups[0].memberCount, 4);

    const change = await demo.post('/api/auth/password', {
      password: 'a-brand-new-password',
      currentPassword: DEMO_ACCOUNT.password,
    });
    assert.equal(change.status, 403);
  });

  it('remembers that the guided tour was seen, once', async () => {
    const { client } = await app.signUp('tour@example.com');
    assert.equal((await client.get('/api/auth/me')).body.user.onboarded, false);
    assert.equal((await client.post('/api/auth/onboarded')).status, 204);
    assert.equal((await client.post('/api/auth/onboarded')).status, 204);
    assert.equal((await client.get('/api/auth/me')).body.user.onboarded, true);
  });

  it('keeps the tour for every demo visitor and for accounts still in setup', async () => {
    const demo = app.client();
    await demo.post('/api/auth/sign-in', DEMO_ACCOUNT);
    assert.equal((await demo.post('/api/auth/onboarded')).status, 204);
    assert.equal((await demo.get('/api/auth/me')).body.user.onboarded, false);

    const pending = app.client();
    await app.oauthSignIn(pending, 'tour-pending@example.com');
    assert.equal((await pending.post('/api/auth/onboarded')).status, 403);
    assert.equal((await app.client().post('/api/auth/onboarded')).status, 401);
  });

  // Parallel setups used to deadlock on the username and session index locks.
  it('finishes several sign-ups at the same moment', async () => {
    const emails = ['par1', 'par2', 'par3', 'par4', 'par5', 'par6'].map((n) => `${n}@example.com`);
    const accounts = await Promise.all(emails.map((email) => app.signUp(email)));
    for (const { client } of accounts) {
      assert.equal((await client.get('/api/auth/me')).body.user.status, 'active');
    }
  });

  // A deploy or dev restart can stop a migration halfway; running it again must finish it.
  it('re-runs the username migration after an interruption', async () => {
    await app.ctx.db.query("DELETE FROM schema_migrations WHERE name = '002_username.sql'");
    assert.deepEqual(await migrate(app.ctx.db), ['002_username.sql']);
  });
});

describe('auth rate limit', { skip }, () => {
  it('locks out sign-in after too many attempts', async () => {
    const app = await startTestApp({ authLimit: 3 });
    try {
      const c = app.client();
      const attempt = () =>
        c.post('/api/auth/sign-in', { email: 'x@example.com', password: 'wrong-password' });
      for (let i = 0; i < 3; i++) assert.equal((await attempt()).status, 401);
      const locked = await attempt();
      assert.equal(locked.status, 429);
      assert.equal(locked.body.error.code, 'rate_limited');
    } finally {
      await app.stop();
    }
  });
});
