import { Analytics } from '@vercel/analytics/react';
import { Component, lazy, StrictMode, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import { ErrorState, Skeleton } from './components/States.tsx';
import { beforeSend } from './lib/analytics.ts';
import { SessionProvider } from './lib/session.tsx';
import Groups from './pages/Groups.tsx';
import { Account, Join, NotFound } from './pages/Other.tsx';
import SignIn from './pages/SignIn.tsx';
import './styles/base.css';
import './styles/app.css';

// The group page is the heaviest screen, so it loads only when someone opens a group.
const GroupPage = lazy(() => import('./pages/group/GroupPage.tsx'));
const tabs = () => import('./pages/group/Tabs.tsx');
const BalancesTab = lazy(() => tabs().then((m) => ({ default: m.BalancesTab })));
const ExpensesTab = lazy(() => tabs().then((m) => ({ default: m.ExpensesTab })));
const ActivityTab = lazy(() => tabs().then((m) => ({ default: m.ActivityTab })));
const SummaryTab = lazy(() => tabs().then((m) => ({ default: m.SummaryTab })));
const MembersTab = lazy(() =>
  import('./pages/group/Members.tsx').then((m) => ({ default: m.MembersTab })),
);

// Last line of defence: a crash in any screen shows a message instead of a blank page.
class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <main id="main" className="page">
        <ErrorState
          message="Something broke on this page. Reload to try again."
          onRetry={() => location.reload()}
        />
      </main>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Analytics beforeSend={beforeSend} />
    <ErrorBoundary>
      <BrowserRouter>
        <SessionProvider>
          <Suspense fallback={<Skeleton hero />}>
            <Routes>
              <Route path="/sign-in" element={<SignIn />} />
              <Route element={<Layout />}>
                <Route path="/groups" element={<Groups />} />
                <Route path="/groups/:id" element={<GroupPage />}>
                  <Route index element={<BalancesTab />} />
                  <Route path="expenses" element={<ExpensesTab />} />
                  <Route path="activity" element={<ActivityTab />} />
                  <Route path="summary" element={<SummaryTab />} />
                  <Route path="members" element={<MembersTab />} />
                </Route>
                <Route path="/join/:code" element={<Join />} />
                <Route path="/account" element={<Account />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
        </SessionProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
