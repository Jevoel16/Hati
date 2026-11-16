// The client-side state machines. Each is a pure (state, event) -> state function;
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

// --- Scanning a QR code with the camera or a photo ----------------------------------------
export type Scan =
  | { status: 'requesting' }
  | { status: 'scanning' }
  | { status: 'found'; text: string }
  | { status: 'denied' }
  | { status: 'unsupported' }
  | { status: 'failed'; message: string };

export type ScanEvent =
  | { type: 'granted' }
  | { type: 'denied' }
  | { type: 'unsupported' }
  | { type: 'failed'; message: string }
  | { type: 'decoded'; text: string }
  | { type: 'retry' };

export function scanReducer(state: Scan, event: ScanEvent): Scan {
  // A photo can be decoded from any screen except the result, so it is accepted everywhere.
  if (state.status === 'found') return state;
  if (event.type === 'decoded') return { status: 'found', text: event.text };
  switch (state.status) {
    case 'requesting':
      if (event.type === 'granted') return { status: 'scanning' };
      if (event.type === 'denied') return { status: 'denied' };
      if (event.type === 'unsupported') return { status: 'unsupported' };
      if (event.type === 'failed') return { status: 'failed', message: event.message };
      return state;
    case 'scanning':
      return event.type === 'failed' ? { status: 'failed', message: event.message } : state;
    case 'denied':
    case 'unsupported':
    case 'failed':
      if (event.type === 'retry') return { status: 'requesting' };
      if (event.type === 'failed') return { status: 'failed', message: event.message };
      return state;
  }
}

// --- The first-run guided tour --------------------------------------------------------------
export type Tour =
  | { status: 'idle' }
  | { status: 'showing'; step: number }
  | { status: 'done' }
  | { status: 'skipped' };

export type TourEvent = 'start' | 'next' | 'back' | 'skip' | 'replay';

// `stepCount` comes from the step list, so "next" on the last step finishes the tour.
export function tourReducer(state: Tour, event: TourEvent, stepCount: number): Tour {
  switch (state.status) {
    case 'idle':
      return event === 'start' || event === 'replay' ? { status: 'showing', step: 0 } : state;
    case 'showing':
      if (event === 'next') {
        return state.step + 1 < stepCount
          ? { status: 'showing', step: state.step + 1 }
          : { status: 'done' };
      }
      if (event === 'back' && state.step > 0) return { status: 'showing', step: state.step - 1 };
      if (event === 'skip') return { status: 'skipped' };
      return state;
    case 'done':
    case 'skipped':
      return event === 'replay' ? { status: 'showing', step: 0 } : state;
  }
}
