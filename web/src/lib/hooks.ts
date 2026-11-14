import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { api, toFailure } from './api.ts';
import type { Page } from './types.ts';
import {
  liveTransition,
  reconnectDelayMs,
  remoteReducer,
  submissionReducer,
  type LiveEvent,
  type LiveStatus,
  type Remote,
  type RemoteEvent,
  type Submission,
} from './machines.ts';

// Loads `path` and keeps it as a Remote<T>. `reload` refreshes in place; a request that is
// overtaken by a newer one (or by leaving the page) is cancelled.
export function useRemote<T>(path: string, refreshKey = 0): [Remote<T>, () => void] {
  const [state, dispatch] = useReducer(
    remoteReducer as (state: Remote<T>, event: RemoteEvent<T>) => Remote<T>,
    { status: 'loading' },
  );
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api<T>('GET', path, undefined, controller.signal)
      .then((data) => dispatch({ type: 'loaded', data }))
      .catch((error) => {
        if (!controller.signal.aborted) dispatch({ type: 'failed', ...toFailure(error) });
      });
    return () => controller.abort();
  }, [path, version, refreshKey]);

  const reload = useCallback(() => {
    dispatch({ type: 'reload' });
    setVersion((v) => v + 1);
  }, []);
  return [state, reload];
}

// Runs one write at a time and tracks it as a Submission.
export function useSubmission(): [Submission, (action: () => Promise<void>) => Promise<boolean>] {
  const [state, dispatch] = useReducer(submissionReducer, { status: 'editing' });
  const busy = useRef(false);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (busy.current) return false;
    busy.current = true;
    dispatch({ type: 'submit' });
    try {
      await action();
      dispatch({ type: 'succeeded' });
      return true;
    } catch (error) {
      dispatch({ type: 'failed', ...toFailure(error) });
      return false;
    } finally {
      busy.current = false;
    }
  }, []);
  return [state, run];
}

// Subscribes to a group's changes. Vercel closes every socket after a few minutes, so a drop
// is normal: reconnect with backoff and refetch once back, in case something was missed.
export function useLive(groupId: string, onChange: () => void): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    let current: LiveStatus = 'connecting';
    let socket: WebSocket | undefined;
    let timer: number | undefined;
    let attempt = 0;
    let everOpened = false;

    const send = (event: LiveEvent) => {
      current = liveTransition(current, event);
      setStatus(current);
    };

    function connect() {
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${scheme}://${location.host}/api/ws`);
      socket.onopen = () => socket?.send(JSON.stringify({ type: 'subscribe', groupId }));
      socket.onmessage = (message) => {
        const data = JSON.parse(String(message.data)) as { type: string };
        if (data.type === 'subscribed') {
          attempt = 0;
          send('opened');
          if (everOpened) onChangeRef.current();
          everOpened = true;
        } else if (data.type === 'changed') {
          onChangeRef.current();
        } else if (data.type === 'denied') {
          send('denied');
          socket?.close();
        }
      };
      socket.onclose = () => {
        if (current === 'closed') return;
        send('dropped');
        timer = window.setTimeout(connect, reconnectDelayMs(attempt++));
      };
    }

    connect();
    return () => {
      send('stopped');
      window.clearTimeout(timer);
      socket?.close();
    };
  }, [groupId]);

  return status;
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · Hati`;
  }, [title]);
}

const PAGE_SIZE = 20;

// A paginated list: loads the first page, and appends the next one on demand.
// A refresh (new refreshKey) goes back to the first page.
export function usePagedList<T>(path: string, refreshKey = 0) {
  const [state, dispatch] = useReducer(
    remoteReducer as (state: Remote<Page<T>>, event: RemoteEvent<Page<T>>) => Remote<Page<T>>,
    { status: 'loading' },
  );
  const [version, setVersion] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<Page<T>>('GET', `${path}?limit=${PAGE_SIZE}`, undefined, controller.signal)
      .then((data) => dispatch({ type: 'loaded', data }))
      .catch((error) => {
        if (!controller.signal.aborted) dispatch({ type: 'failed', ...toFailure(error) });
      });
    return () => controller.abort();
  }, [path, version, refreshKey]);

  const reload = useCallback(() => {
    dispatch({ type: 'reload' });
    setVersion((v) => v + 1);
  }, []);

  const loadMore = useCallback(async () => {
    if (state.status !== 'success' || state.data.nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await api<Page<T>>(
        'GET',
        `${path}?limit=${PAGE_SIZE}&offset=${state.data.nextOffset}`,
      );
      dispatch({
        type: 'loaded',
        data: { items: [...state.data.items, ...next.items], nextOffset: next.nextOffset },
      });
    } catch (error) {
      dispatch({ type: 'failed', ...toFailure(error) });
    } finally {
      setLoadingMore(false);
    }
  }, [path, state, loadingMore]);

  return { state, reload, loadMore, loadingMore };
}
