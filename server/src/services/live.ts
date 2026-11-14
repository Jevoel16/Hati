import type { WebSocket } from 'ws';
import type { Ctx } from '../context.js';
import * as activity from '../data/activity.js';
import type { GroupEvent } from '../data/activity.js';
import * as groups from '../data/groups.js';

const POLL_MS = 1000;
// Wider than the polling interval, so an event that commits late is still seen.
const WINDOW_SECONDS = 5;
const MEMBERSHIP_ACTIONS = new Set(['member_left', 'member_removed', 'group_deleted']);

type Subscriber = { socket: WebSocket; userId: string };

export type LiveHub = {
  subscribe(socket: WebSocket, userId: string, groupId: string): Promise<boolean>;
  remove(socket: WebSocket): void;
  close(): void;
};

// Instances do not share memory and TiDB has no LISTEN/NOTIFY, so each instance polls the
// group_events table while it has subscribers and forwards what it finds to its own sockets.
// The message only says "this group changed"; the browser then refetches over REST.
export function createLiveHub(ctx: Ctx): LiveHub {
  const byGroup = new Map<string, Set<Subscriber>>();
  const seen = new Map<number, number>();
  let timer: NodeJS.Timeout | undefined;
  let polling = false;

  async function deliver(event: GroupEvent): Promise<void> {
    const subscribers = byGroup.get(event.groupId);
    if (!subscribers) return;
    for (const subscriber of [...subscribers]) {
      // Someone who just left or was removed must stop receiving this group's events.
      if (MEMBERSHIP_ACTIONS.has(event.action)) {
        const membership = await groups.findMembership(ctx.db, event.groupId, subscriber.userId);
        if (membership?.status !== 'active') subscribers.delete(subscriber);
      }
      if (subscriber.socket.readyState === subscriber.socket.OPEN) {
        subscriber.socket.send(
          JSON.stringify({ type: 'changed', groupId: event.groupId, action: event.action }),
        );
      }
    }
    if (subscribers.size === 0) byGroup.delete(event.groupId);
  }

  async function poll(): Promise<void> {
    if (polling) return;
    polling = true;
    try {
      const now = Date.now();
      for (const event of await activity.recentEvents(ctx.db, WINDOW_SECONDS)) {
        if (seen.has(event.id)) continue;
        seen.set(event.id, now);
        await deliver(event);
      }
      for (const [id, at] of seen) {
        if (now - at > WINDOW_SECONDS * 3000) seen.delete(id);
      }
    } catch (error) {
      console.error('Live poll failed:', error instanceof Error ? error.message : error);
    } finally {
      polling = false;
    }
  }

  function syncTimer(): void {
    if (byGroup.size > 0 && !timer) {
      timer = setInterval(() => void poll(), POLL_MS);
      timer.unref();
    } else if (byGroup.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  return {
    async subscribe(socket, userId, groupId) {
      const membership = await groups.findMembership(ctx.db, groupId, userId);
      if (membership?.status !== 'active') return false;
      if (!byGroup.has(groupId)) byGroup.set(groupId, new Set());
      const subscribers = byGroup.get(groupId)!;
      if (![...subscribers].some((s) => s.socket === socket)) subscribers.add({ socket, userId });
      syncTimer();
      return true;
    },
    remove(socket) {
      for (const [groupId, subscribers] of byGroup) {
        for (const subscriber of subscribers) {
          if (subscriber.socket === socket) subscribers.delete(subscriber);
        }
        if (subscribers.size === 0) byGroup.delete(groupId);
      }
      syncTimer();
    },
    close() {
      byGroup.clear();
      syncTimer();
    },
  };
}
