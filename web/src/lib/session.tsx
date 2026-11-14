import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api.ts';
import type { Remote } from './machines.ts';
import type { Session } from './types.ts';

// `null` data means "loaded, and nobody is signed in".
type SessionValue = { state: Remote<Session | null>; refresh: () => Promise<void> };

const SessionContext = createContext<SessionValue | null>(null);

const loadSession = () => api<Session | null>('GET', '/auth/me');

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Remote<Session | null>>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      setState({ status: 'success', data: await loadSession() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load your account.';
      setState({ status: 'failed', message, code: 'unknown' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <SessionContext.Provider value={{ state, refresh }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider.');
  return value;
}

// Inside the signed-in part of the app the user is always present.
export function useUser() {
  const { state } = useSession();
  if (state.status !== 'success' || !state.data) throw new Error('No signed-in user.');
  return state.data.user;
}
