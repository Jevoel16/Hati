import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useSession } from '../lib/session.tsx';
import { Dialog } from './Dialog.tsx';
import { PasswordForm } from './PasswordForm.tsx';
import { ErrorState, Skeleton } from './States.tsx';

// Wraps every signed-in page. Which screen shows depends on the session and account state:
// loading, failed, signed out, password still to set, or the page itself.
export function Layout() {
  const { state, refresh } = useSession();
  const location = useLocation();
  const navigate = useNavigate();

  if (state.status === 'loading') {
    return (
      <div className="page">
        <main id="main">
          <Skeleton hero />
        </main>
      </div>
    );
  }
  if (state.status === 'failed') {
    return (
      <div className="page">
        <main id="main">
          <ErrorState message={state.message} onRetry={() => void refresh()} />
        </main>
      </div>
    );
  }
  if (!state.data) {
    return <Navigate to={`/sign-in?next=${location.pathname}`} replace />;
  }
  const { user } = state.data;

  const signOut = async () => {
    await api('POST', '/auth/sign-out').catch(() => {});
    await refresh();
    navigate('/sign-in');
  };

  return (
    <div className="page">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="shell-header">
        <Link to="/groups" className="wordmark">
          Hati
        </Link>
        <nav aria-label="Account">
          <Link to="/account" className="button button--link">
            {user.name}
          </Link>
          <button type="button" className="button button--quiet" onClick={() => void signOut()}>
            Sign out
          </button>
        </nav>
      </header>
      <main id="main">
        {user.status === 'password_pending' ? (
          <Dialog title="Set a password to continue" dismissable={false}>
            <p>
              You signed in with Google or GitHub. Choose a password too, so you can always get into
              Hati with {user.email}.
            </p>
            <PasswordForm askCurrent={false} submitLabel="Save and continue" />
          </Dialog>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
