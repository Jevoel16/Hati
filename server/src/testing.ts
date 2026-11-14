import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createServer } from './app.js';
import type { Config } from './config.js';
import type { Ctx } from './context.js';
import { connect } from './db.js';
import { migrate } from './migrate.js';

// Integration tests need a real TiDB (or MySQL) server; they are skipped without one.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const skip = TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL is not set';

export const APP_URL = 'http://hati.test';

// Stands in for Google and GitHub: the "code" is the email, echoed back as the token.
const fakeProviderFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  if (init?.method === 'POST') {
    return json({ access_token: (init.body as URLSearchParams).get('code') });
  }
  const email = String(new Headers(init?.headers).get('authorization')).replace('Bearer ', '');
  const name = email.split('@')[0]!;
  if (url.includes('googleapis.com')) {
    return json({
      sub: `g-${email}`,
      email,
      email_verified: !email.startsWith('unverified'),
      name,
    });
  }
  if (url.endsWith('/user/emails')) return json([{ email, primary: true, verified: true }]);
  return json({ id: [...email].reduce((sum, ch) => sum + ch.charCodeAt(0), 0), name });
}) as typeof fetch;

export type Reply<T = any> = { status: number; body: T; location: string | null }; // eslint-disable-line @typescript-eslint/no-explicit-any -- test bodies are asserted field by field

export type Client = {
  cookieHeader(): string;
  request(method: string, path: string, body?: unknown, origin?: string): Promise<Reply>;
  get(path: string): Promise<Reply>;
  post(path: string, body?: unknown): Promise<Reply>;
};

export async function startTestApp(options: { authLimit?: number; cronSecret?: string } = {}) {
  const serverUrl = new URL(TEST_DATABASE_URL!);
  const database = `hati_test_${randomBytes(6).toString('hex')}`;
  const admin = connect(serverUrl.toString());
  await admin.query(`CREATE DATABASE \`${database}\``);
  serverUrl.pathname = `/${database}`;
  const db = connect(serverUrl.toString());
  await migrate(db);

  const config: Config = {
    isProduction: false,
    port: 0,
    appUrl: APP_URL,
    databaseUrl: serverUrl.toString(),
    jwtSecret: 'test-secret-test-secret-test-secret-0123',
    google: { clientId: 'google-id', clientSecret: 'google-secret' },
    github: { clientId: 'github-id', clientSecret: 'github-secret' },
    cronSecret: options.cronSecret,
  };
  const ctx: Ctx = {
    db,
    config,
    fetch: fakeProviderFetch,
    hashCost: 4,
    authLimit: options.authLimit ?? 10_000,
  };
  const { server, close } = createServer(ctx);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  function client(): Client {
    const cookies = new Map<string, string>();
    const cookieHeader = () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    async function request(method: string, path: string, body?: unknown, origin = APP_URL) {
      const response = await fetch(baseUrl + path, {
        method,
        redirect: 'manual',
        headers: {
          origin,
          cookie: cookieHeader(),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      for (const line of response.headers.getSetCookie()) {
        const [name, value] = line.split(';')[0]!.split('=') as [string, string];
        if (value) cookies.set(name, value);
        else cookies.delete(name);
      }
      const text = await response.text();
      return {
        status: response.status,
        body: text ? JSON.parse(text) : null,
        location: response.headers.get('location'),
      };
    }
    return {
      cookieHeader,
      request,
      get: (path) => request('GET', path),
      post: (path, body) => request('POST', path, body ?? {}),
    };
  }

  // Runs the OAuth redirect dance against the fake provider.
  async function oauthSignIn(c: Client, email: string, provider = 'google', next = '') {
    const start = await c.get(`/api/auth/${provider}/start${next && `?next=${next}`}`);
    const state = new URL(start.location!).searchParams.get('state');
    return c.get(`/api/auth/${provider}/callback?code=${encodeURIComponent(email)}&state=${state}`);
  }

  // A fully set-up account: signed in through OAuth, password chosen.
  async function signUp(email: string, password = 'correct-horse-battery') {
    const c = client();
    await oauthSignIn(c, email);
    await c.post('/api/auth/password', { password });
    const me = await c.get('/api/auth/me');
    return { client: c, id: me.body.user.id as string };
  }

  return {
    ctx,
    baseUrl,
    client,
    oauthSignIn,
    signUp,
    async stop() {
      await close();
      await db.close();
      await admin.query(`DROP DATABASE \`${database}\``);
      await admin.close();
    },
  };
}
