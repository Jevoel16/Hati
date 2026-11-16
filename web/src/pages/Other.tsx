import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TextField } from '../components/Field.tsx';
import { PasswordForm } from '../components/PasswordForm.tsx';
import { useReplayTour } from '../components/Tour.tsx';
import { fieldError, FormError, RemoteView, SubmitButton } from '../components/States.tsx';
import { api } from '../lib/api.ts';
import { useDocumentTitle, useRemote, useSubmission } from '../lib/hooks.ts';
import { useSession, useUser } from '../lib/session.tsx';
import type { InvitePreview, PaymentMethod } from '../lib/types.ts';

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

// Suggestions only; any InstaPay bank or wallet name is fine.
const METHOD_NAMES = ['GCash', 'Maya', 'Landbank', 'BDO', 'BPI', 'UnionBank', 'GoTyme', 'SeaBank'];
const MAX_METHODS = 5;

function PaymentQrSection() {
  const user = useUser();
  const [saved, reload] = useRemote<{ methods: PaymentMethod[] }>('/auth/payment-qrs');
  const [submission, run] = useSubmission();
  const [label, setLabel] = useState('');
  const [scanning, setScanning] = useState(false);
  const busy = submission.status === 'submitting';
  const count = saved.status === 'success' ? saved.data.methods.length : 0;

  const onScan = (payload: string) => {
    setScanning(false);
    void run(() => api('POST', '/auth/payment-qrs', { label, payload })).then((ok) => {
      if (!ok) return;
      setLabel('');
      reload();
    });
  };
  const remove = (method: PaymentMethod) => {
    if (!window.confirm(`Remove your ${method.label} QR? Others will no longer see it.`)) return;
    void run(() => api('DELETE', `/auth/payment-qrs/${method.id}`)).then((ok) => ok && reload());
  };

  return (
    <section className="stack" aria-labelledby="payment-heading">
      <h2 id="payment-heading">Payment QRs</h2>
      <p className="muted">
        Add the QR Ph code from each wallet or bank you use. When someone in a group owes you, they
        pick one and Hati fills in the exact amount.
      </p>
      <RemoteView state={saved} onRetry={reload}>
        {({ methods }) =>
          methods.length === 0 ? (
            <p>No payment QRs yet. Add one so others can pay you their share.</p>
          ) : (
            <ul className="list">
              {methods.map((method) => (
                <li key={method.id}>
                  <span className="list-main">
                    <span className="list-title">{method.label}</span>{' '}
                    <span className="muted">pays {method.payeeName}</span>
                  </span>
                  {!user.isDemo && (
                    <button
                      type="button"
                      className="button button--link"
                      disabled={busy}
                      onClick={() => remove(method)}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )
        }
      </RemoteView>
      {user.isDemo ? (
        <p className="muted">The demo account keeps its sample QRs, which pay no real account.</p>
      ) : count >= MAX_METHODS ? (
        <p className="muted">That’s the most you can save. Remove one to add another.</p>
      ) : (
        <form
          className="stack stack--sm"
          onSubmit={(event) => {
            event.preventDefault();
            setScanning(true);
          }}
        >
          <TextField
            label="Wallet or bank"
            list="payment-method-names"
            value={label}
            maxLength={40}
            required
            autoComplete="off"
            error={fieldError(submission, 'label')}
            onChange={(event) => setLabel(event.target.value)}
          />
          <datalist id="payment-method-names">
            {METHOD_NAMES.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <div className="row">
            <button type="submit" className="button button--quiet" disabled={busy}>
              Add its QR
            </button>
          </div>
        </form>
      )}
      <FormError state={submission} />
      {scanning && (
        <Suspense fallback={null}>
          <QrScanner
            title={`Add your ${label.trim()} QR`}
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
  const replayTour = useReplayTour();
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
      <section className="stack stack--sm" aria-labelledby="tour-heading">
        <h2 id="tour-heading">Guided tour</h2>
        <p className="muted">
          Four short steps: start a group, add an expense, read the balances and settle up.
        </p>
        <div>
          <button type="button" className="button button--quiet" onClick={replayTour}>
            Replay the tour
          </button>
        </div>
      </section>
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
