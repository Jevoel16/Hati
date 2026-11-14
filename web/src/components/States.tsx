import type { ReactNode } from 'react';
import type { Remote, Submission } from '../lib/machines.ts';

export function Skeleton({ rows = 3, hero = false }: { rows?: number; hero?: boolean }) {
  return (
    <div className="stack" aria-busy="true">
      <span className="visually-hidden">Loading…</span>
      {hero && <span className="skeleton skeleton--hero" />}
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="skeleton skeleton--row" />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="button button--quiet" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="state muted">{children}</div>;
}

// Renders one screen per state of a Remote<T>; the switch has no default, so adding a state
// without a screen is a type error.
export function RemoteView<T>({
  state,
  onRetry,
  skeleton,
  children,
}: {
  state: Remote<T>;
  onRetry: () => void;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  switch (state.status) {
    case 'loading':
      return <>{skeleton ?? <Skeleton />}</>;
    case 'failed':
      return <ErrorState message={state.message} onRetry={onRetry} />;
    case 'success':
      return <>{children(state.data)}</>;
  }
}

export function FormError({ state }: { state: Submission }) {
  return (
    <div role="alert">
      {state.status === 'failed' && <p className="form-error">{state.message}</p>}
    </div>
  );
}

export function SubmitButton({
  state,
  children,
  busyLabel = 'Saving…',
  className = 'button',
}: {
  state: Submission;
  children: ReactNode;
  busyLabel?: string;
  className?: string;
}) {
  const busy = state.status === 'submitting';
  return (
    <button type="submit" className={className} disabled={busy}>
      {busy ? busyLabel : children}
    </button>
  );
}

export const fieldError = (state: Submission, name: string): string | undefined =>
  state.status === 'failed' ? state.fields[name] : undefined;
