import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { TextField } from '../components/Field.tsx';
import { FormError, RemoteView, Skeleton, SubmitButton } from '../components/States.tsx';
import { api } from '../lib/api.ts';
import { useDocumentTitle, useRemote, useSubmission } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import type { Providers } from '../lib/types.ts';

const SAFE_NEXT_PATH = /^\/(?!\/)[\w\-/]*$/;

export default function SignIn() {
  useDocumentTitle('Sign in');
  const { state: session, refresh } = useSession();
  const [params] = useSearchParams();
  const [providers, reloadProviders] = useRemote<Providers>('/auth/providers');
  const [submission, run] = useSubmission();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const requested = params.get('next') ?? '';
  const next = SAFE_NEXT_PATH.test(requested) ? requested : '/groups';

  if (session.status === 'success' && session.data) return <Navigate to={next} replace />;

  const signIn = (credentials: { email: string; password: string }) =>
    run(async () => {
      await api('POST', '/auth/sign-in', credentials);
      await refresh();
    });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void signIn({ email, password });
  };

  return (
    <main id="main" className="page auth stack">
      <Link to="/" className="wordmark" reloadDocument>
        Hati
      </Link>
      <h1>Sign in</h1>
      {params.get('error') === 'oauth' && (
        <p className="form-error" role="alert">
          That sign-in did not go through. Try again, or use another method.
        </p>
      )}

      <RemoteView state={providers} onRetry={reloadProviders} skeleton={<Skeleton rows={2} />}>
        {(available) => (
          <div className="stack">
            {available.google && (
              <a className="button" href={`/api/auth/google/start?next=${next}`}>
                Continue with Google
              </a>
            )}
            {available.github && (
              <a className="button button--quiet" href={`/api/auth/github/start?next=${next}`}>
                Continue with GitHub
              </a>
            )}
            {(available.google || available.github) && (
              <p className="muted">New here? Either button creates your account.</p>
            )}

            <p className="divider">or use your password</p>
            <form className="stack" onSubmit={onSubmit} noValidate>
              <TextField
                label="Email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <TextField
                label="Password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <FormError state={submission} />
              <SubmitButton
                state={submission}
                className={available.google ? 'button button--quiet' : 'button'}
                busyLabel="Signing in…"
              >
                Sign in
              </SubmitButton>
            </form>

            <div className="panel stack stack--sm">
              <h2>Just looking?</h2>
              <p>
                The demo account has a sample boarding house with four people. It resets every day.
              </p>
              <button
                type="button"
                className="button button--quiet"
                disabled={submission.status === 'submitting'}
                onClick={() => void signIn(available.demo)}
              >
                Open the demo
              </button>
            </div>
          </div>
        )}
      </RemoteView>
    </main>
  );
}
