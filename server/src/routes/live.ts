import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Ctx } from '../context.js';
import { isAllowedOrigin } from '../middleware/guards.js';
import { SESSION_COOKIE } from '../middleware/session.js';
import { resolveSession } from '../services/auth.js';
import { createLiveHub } from '../services/live.js';
import * as schemas from './schemas.js';

// /api/server is the Vercel Function's own path; /api/ws reaches it through a rewrite.
const LIVE_PATHS = new Set(['/api/ws', '/api/server']);
const PING_MS = 30_000;

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

function refuse(socket: Duplex, status: string): void {
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
}

// A browser does not apply the same-origin policy to WebSockets, so the upgrade request
// gets the same checks as a write: this site's Origin and a signed-in, active account.
export function attachLive(server: Server, ctx: Ctx): { close(): void } {
  const hub = createLiveHub(ctx);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const alive = new WeakSet<WebSocket>();

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    void (async () => {
      const { pathname } = new URL(req.url ?? '/', 'http://localhost');
      if (!LIVE_PATHS.has(pathname)) return refuse(socket, '404 Not Found');
      const host = req.headers['x-forwarded-host'] ?? req.headers.host;
      if (!isAllowedOrigin(ctx.config, req.headers.origin, host)) {
        return refuse(socket, '403 Forbidden');
      }
      const auth = await resolveSession(ctx, readCookie(req.headers.cookie, SESSION_COOKIE));
      if (auth?.user.status !== 'active') return refuse(socket, '401 Unauthorized');
      const userId = auth.user.id;
      wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, userId));
    })().catch(() => socket.destroy());
  });

  function onConnection(ws: WebSocket, userId: string): void {
    alive.add(ws);
    ws.on('pong', () => alive.add(ws));
    ws.on('close', () => hub.remove(ws));
    ws.on('error', () => ws.terminate());
    ws.on('message', (data) => {
      void (async () => {
        const message = JSON.parse(String(data)) as { type?: unknown; groupId?: unknown };
        const groupId = schemas.id.safeParse(message.groupId);
        if (message.type !== 'subscribe' || !groupId.success) return;
        const allowed = await hub.subscribe(ws, userId, groupId.data);
        ws.send(JSON.stringify({ type: allowed ? 'subscribed' : 'denied', groupId: groupId.data }));
      })().catch(() => ws.close(1008, 'Bad message'));
    });
  }

  // Drops connections whose other end vanished without closing.
  const pinger = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, PING_MS);
  pinger.unref();

  return {
    close() {
      clearInterval(pinger);
      hub.close();
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
