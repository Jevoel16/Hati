import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.url(),
  DATABASE_URL: z.string().startsWith('mysql://', 'must be a mysql:// URL (TiDB)'),
  JWT_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  CRON_SECRET: z.string().min(16).optional(),
});

export type OAuthClient = { clientId: string; clientSecret: string };

export type Config = {
  isProduction: boolean;
  port: number;
  appUrl: string;
  databaseUrl: string;
  jwtSecret: string;
  google?: OAuthClient;
  github?: OAuthClient;
  cronSecret?: string;
};

function oauthClient(clientId?: string, clientSecret?: string): OAuthClient | undefined {
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  // An empty value in .env (KEY=) means "not set".
  const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const parsed = schema.safeParse(present);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n  ${problems.join('\n  ')}`);
  }
  const e = parsed.data;
  return {
    isProduction: e.NODE_ENV === 'production',
    port: e.PORT,
    appUrl: e.APP_URL.replace(/\/$/, ''),
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    google: oauthClient(e.GOOGLE_CLIENT_ID, e.GOOGLE_CLIENT_SECRET),
    github: oauthClient(e.GITHUB_CLIENT_ID, e.GITHUB_CLIENT_SECRET),
    cronSecret: e.CRON_SECRET,
  };
}
