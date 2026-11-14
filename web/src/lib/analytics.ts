import type { BeforeSend } from '@vercel/analytics';

// Group ids and invite codes must not reach the analytics service, and neither may a query string.
export function redactUrl(url: string): string {
  const { origin, pathname } = new URL(url);
  const path = pathname
    .replace(/^\/groups\/[^/]+/, '/groups/[id]')
    .replace(/^\/join\/[^/]+/, '/join/[code]');
  return origin + path;
}

export const beforeSend: BeforeSend = (event) => ({ ...event, url: redactUrl(event.url) });
