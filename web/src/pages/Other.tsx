import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PasswordForm } from '../components/PasswordForm.tsx';
import { FormError, RemoteView, SubmitButton } from '../components/States.tsx';
import { api } from '../lib/api.ts';
import { useDocumentTitle, useRemote, useSubmission } from '../lib/hooks.ts';
import { useSession, useUser } from '../lib/session.tsx';
import type { InvitePreview } from '../lib/types.ts';

const QrScanner = lazy(() => import('../components/QrScanner.tsx'));

export function Join() {
  useDocumentTitle('Join a group');
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const [invite, reload] = useRemote<InvitePreview>(`/invites/${code}`);
  const [submission, run] = useSubmission();

  const join = () =>
    run(async () => {
      const { groupId } = await api<{ groupId: string }>('POST', `/invites/${code}/join`);
      navigate(`/groups/${groupId}`);
    });

  return (
    <RemoteView state={invite} onRetry={reload}>
      {(preview) => (
        <form
          className="stack narrow"
          onSubmit={(event) => {
            event.preventDefault();
            void join();
          }}
        >
          <h1>Join {preview.name}?</h1>
          <p className="muted">
            {preview.memberCount} {preview.memberCount === 1 ? 'member' : 'members'} so far.
            Everyone in the group will see your name and the expenses you add.
          </p>
          <FormError state={submission} />
          <div className="row">
            {preview.alreadyMember ? (
              <Link className="button" to={`/groups/${preview.groupId}`}>
                Open group
              </Link>
            ) : (
              <SubmitButton state={submission} busyLabel="Joining…">
                Join group
              </SubmitButton>
            )}
            <Link className="button button--quiet" to="/groups">
              Not now
            </Link>
          </div>
        </form>
      )}
    </RemoteView>
  );
}

function PaymentQrSection() {
  const user = useUser();
  const [saved, reload] = useRemote<{ payeeName: string } | null>('/auth/payment-qr');
  const [submission, run] = useSubmission();
  const [scanning, setScanning] = useState(false);
  const busy = submission.status === 'submitting';
  const hasQr = saved.status === 'success' && saved.data !== null;

  const onScan = (payload: string) => {
    setScanning(false);
    void run(() => api('PUT', '/auth/payment-qr', { payload })).then((ok) => ok && reload());
  };
  const remove = () => {
    if (!window.confirm('Remove your payment QR? Others will no longer see it.')) return;
    void run(() => api('DELETE', '/auth/payment-qr')).then((ok) => ok && reload());
  };

  return (
    <section className="stack" aria-labelledby="payment-heading">
      <h2 id="payment-heading">Payment QR</h2>
      <p className="muted">
        Add the QR Ph code from GCash, Maya or your bank’s InstaPay. When someone in a group owes
        you, Hati shows them your QR with the exact amount filled in.
      </p>
      <RemoteView state={saved} onRetry={reload}>
        {(data) =>
          data ? (
            <p>
              Payments go to <strong>{data.payeeName}</strong>.
            </p>
          ) : (
            <p>No payment QR yet.</p>
          )
        }
      </RemoteView>
      {user.isDemo ? (
        <p className="muted">The demo account keeps its sample QR, which pays no real account.</p>
      ) : (
        <div className="row">
          <button
            type="button"
            className="button button--quiet"
            disabled={busy}
            onClick={() => setScanning(true)}
          >
            {hasQr ? 'Replace payment QR' : 'Add payment QR'}
          </button>
          {hasQr && (
            <button type="button" className="button button--link" disabled={busy} onClick={remove}>
              Remove
            </button>
          )}
        </div>
      )}
      <FormError state={submission} />
      {scanning && (
        <Suspense fallback={null}>
          <QrScanner
            title="Add your payment QR"
            hint="Scan the QR Ph from your banking app, or choose a screenshot of it. Only the code’s text is saved, never the image."
            onScan={onScan}
            onClose={() => setScanning(false)}
          />
        </Suspense>
      )}
    </section>
  );
}

export function Account() {
  useDocumentTitle('Account');
  const user = useUser();
  const { state } = useSession();
  const [saved, setSaved] = useState(false);
  // Someone who just came back from Google or GitHub may reset a forgotten password.
  const viaOAuth = state.status === 'success' && state.data?.authMethod === 'oauth';

  return (
    <div className="stack stack--lg narrow">
      <section className="stack stack--sm">
        <h1>{user.name}</h1>
        {user.username && <p>@{user.username}</p>}
        <p className="muted">{user.email}</p>
      </section>
      <section className="stack" aria-labelledby="password-heading">
        <h2 id="password-heading">Change password</h2>
        {user.isDemo ? (
          <p className="muted">The demo account keeps its password so everyone can use it.</p>
        ) : (
          <>
            <PasswordForm
              askCurrent={!viaOAuth}
              submitLabel="Change password"
              onDone={() => setSaved(true)}
            />
            <p role="status">
              {saved && 'Password changed. Your other devices have been signed out.'}
            </p>
          </>
        )}
      </section>
      <PaymentQrSection />
    </div>
  );
}

export function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <div className="stack narrow">
      <h1>That page does not exist</h1>
      <p className="muted">The link may be old, or the group may have been deleted.</p>
      <div>
        <Link className="button" to="/groups">
          Go to your groups
        </Link>
      </div>
    </div>
  );
}
