import { createHash, randomBytes } from 'node:crypto';
import type { Config, OAuthClient } from '../config.js';
import type { Ctx } from '../context.js';

export const PROVIDERS = ['google', 'github'] as const;
export type Provider = (typeof PROVIDERS)[number];
export type Profile = { provider: Provider; providerId: string; email: string; name: string };

export const isProvider = (value: string): value is Provider =>
  (PROVIDERS as readonly string[]).includes(value);

const endpoints = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
  },
  github: {
    authorize: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
  },
} as const;

export const redirectUri = (config: Config, provider: Provider) =>
  `${config.appUrl}/api/auth/${provider}/callback`;

// PKCE: the verifier stays in our cookie, only its hash goes to the provider.
export function createPkce(): { state: string; verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return {
    state: randomBytes(16).toString('base64url'),
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  };
}

export function authorizationUrl(
  config: Config,
  provider: Provider,
  client: OAuthClient,
  state: string,
  challenge: string,
): string {
  const url = new URL(endpoints[provider].authorize);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri(config, provider),
    response_type: 'code',
    scope: endpoints[provider].scope,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

async function getJson(ctx: Ctx, url: string, accessToken: string): Promise<unknown> {
  const response = await ctx.fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      'user-agent': 'hati',
    },
  });
  if (!response.ok) throw new Error(`OAuth profile request failed with ${response.status}.`);
  return response.json();
}

async function exchangeCode(
  ctx: Ctx,
  provider: Provider,
  client: OAuthClient,
  code: string,
  verifier: string,
): Promise<string> {
  const response = await ctx.fetch(endpoints[provider].token, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri(ctx.config, provider),
    }),
  });
  const body = (await response.json()) as { access_token?: unknown };
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new Error('OAuth code exchange failed.');
  }
  return body.access_token;
}

// Only an email the provider has verified is accepted, because it becomes the account's identity.
export async function fetchProfile(
  ctx: Ctx,
  provider: Provider,
  client: OAuthClient,
  code: string,
  verifier: string,
): Promise<Profile> {
  const token = await exchangeCode(ctx, provider, client, code, verifier);

  if (provider === 'google') {
    const info = (await getJson(
      ctx,
      'https://openidconnect.googleapis.com/v1/userinfo',
      token,
    )) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
    if (!info.sub || !info.email || info.email_verified !== true) {
      throw new Error('Google account has no verified email.');
    }
    return {
      provider,
      providerId: info.sub,
      email: info.email.toLowerCase(),
      name: info.name?.trim() || info.email,
    };
  }

  const user = (await getJson(ctx, 'https://api.github.com/user', token)) as {
    id?: number;
    name?: string | null;
    login?: string;
  };
  const emails = (await getJson(ctx, 'https://api.github.com/user/emails', token)) as {
    email: string;
    primary: boolean;
    verified: boolean;
  }[];
  const primary = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified) : undefined;
  if (!user.id || !primary) throw new Error('GitHub account has no verified primary email.');
  return {
    provider,
    providerId: String(user.id),
    email: primary.email.toLowerCase(),
    name: user.name?.trim() || user.login || primary.email,
  };
}
