import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useSession } from '../lib/session.tsx';
import type { User } from '../lib/types.ts';
import { Dialog } from './Dialog.tsx';
import { SetupForm } from './SetupForm.tsx';
import { ErrorState, Skeleton } from './States.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';
import { Wordmark } from './Wordmark.tsx';

// Wraps every signed-in page. Which screen shows depends on the session and account state:
// loading, failed, signed out, account setup still to finish, or the page itself.
function renderPage(user: User) {
  switch (user.status) {
    case 'password_pending':
      return (
        <Dialog title="Finish setting up your account" dismissable={false}>
          <p>
            You signed in with Google or GitHub. Choose a username, and a password so you can always
            get into Hati with {user.email}.
          </p>
          <SetupForm needsPassword />
        </Dialog>
      );
    case 'username_pending':
      return (
        <Dialog title="Choose a username" dismissable={false}>
          <p>Hati now gives every account a username. Pick yours to continue.</p>
          <SetupForm needsPassword={false} />
        </Dialog>
      );
    case 'active':
      return <Outlet />;
  }
}

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
        <Link to="/groups" className="wordmark" aria-label="Hati">
          <Wordmark />
        </Link>
        <nav aria-label="Account">
          <ThemeToggle />
          <Link to="/account" className="button button--link">
            {user.name}
          </Link>
          <button type="button" className="button button--quiet" onClick={() => void signOut()}>
            Sign out
          </button>
        </nav>
      </header>
      <main id="main">{renderPage(user)}</main>
    </div>
  );
}
