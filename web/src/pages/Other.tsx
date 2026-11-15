import { Link, useNavigate, useParams } from 'react-router-dom';
import { PasswordForm } from '../components/PasswordForm.tsx';
import { FormError, RemoteView, SubmitButton } from '../components/States.tsx';
import { api } from '../lib/api.ts';
import { useDocumentTitle, useRemote, useSubmission } from '../lib/hooks.ts';
import { useSession, useUser } from '../lib/session.tsx';
import type { InvitePreview } from '../lib/types.ts';
import { useState } from 'react';

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
