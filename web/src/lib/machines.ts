// The three client-side state machines. Each is a pure (state, event) -> state function;
// the tables are also written out in docs/state-machines.md.

// --- Loading data from the API -------------------------------------------------------------
export type Remote<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'failed'; message: string; code: string };

export type RemoteEvent<T> =
  | { type: 'reload' }
  | { type: 'loaded'; data: T }
  | { type: 'failed'; message: string; code: string };

export function remoteReducer<T>(state: Remote<T>, event: RemoteEvent<T>): Remote<T> {
  switch (event.type) {
    case 'loaded':
      return { status: 'success', data: event.data };
    case 'failed':
      // A failed background refresh keeps the data already on screen, unless access was lost.
      if (state.status === 'success' && event.code !== 'not_found') return state;
      return { status: 'failed', message: event.message, code: event.code };
    case 'reload':
      // Reloading after an error starts over; reloading good data refreshes it in place.
      return state.status === 'failed' ? { status: 'loading' } : state;
  }
}

// --- Submitting a form ---------------------------------------------------------------------
export type FieldErrors = Record<string, string>;
export type Submission =
  | { status: 'editing' }
  | { status: 'submitting' }
  | { status: 'failed'; message: string; fields: FieldErrors };

export type SubmissionEvent =
  | { type: 'submit' }
  | { type: 'succeeded' }
  | { type: 'failed'; message: string; fields?: FieldErrors };

export function submissionReducer(state: Submission, event: SubmissionEvent): Submission {
  switch (state.status) {
    case 'editing':
    case 'failed':
      return event.type === 'submit' ? { status: 'submitting' } : state;
    case 'submitting':
      if (event.type === 'succeeded') return { status: 'editing' };
      if (event.type === 'failed') {
        return { status: 'failed', message: event.message, fields: event.fields ?? {} };
      }
      return state;
  }
}

// --- The live WebSocket connection ---------------------------------------------------------
export type LiveStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';
export type LiveEvent = 'opened' | 'dropped' | 'denied' | 'stopped';

const liveTransitions: Record<LiveStatus, Partial<Record<LiveEvent, LiveStatus>>> = {
  connecting: { opened: 'open', dropped: 'reconnecting', denied: 'closed', stopped: 'closed' },
  open: { dropped: 'reconnecting', denied: 'closed', stopped: 'closed' },
  reconnecting: { opened: 'open', dropped: 'reconnecting', denied: 'closed', stopped: 'closed' },
  closed: {},
};

export const liveTransition = (state: LiveStatus, event: LiveEvent): LiveStatus =>
  liveTransitions[state][event] ?? state;

// 1s, 2s, 4s ... capped at 15s, so a server restart is not hammered by every open tab.
export const reconnectDelayMs = (attempt: number): number => Math.min(1000 * 2 ** attempt, 15_000);
