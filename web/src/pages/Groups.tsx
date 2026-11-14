import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TextField } from '../components/Field.tsx';
import {
  EmptyState,
  fieldError,
  FormError,
  RemoteView,
  SubmitButton,
} from '../components/States.tsx';
import { api } from '../lib/api.ts';
import { useDocumentTitle, useRemote, useSubmission } from '../lib/hooks.ts';
import { describeBalance } from '../lib/money.ts';
import type { GroupListItem } from '../lib/types.ts';

function NewGroupForm() {
  const navigate = useNavigate();
  const [submission, run] = useSubmission();
  const [name, setName] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const { id } = await api<{ id: string }>('POST', '/groups', { name });
      navigate(`/groups/${id}`);
    });
  };

  return (
    <form className="stack" onSubmit={onSubmit} noValidate>
      <TextField
        label="Group name"
        placeholder="Unit 3B, Thesis team, Siargao trip"
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={fieldError(submission, 'name')}
      />
      <FormError state={submission} />
      <SubmitButton state={submission} busyLabel="Creating…">
        Create group
      </SubmitButton>
    </form>
  );
}

function JoinForm() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    // Accepts a pasted invite link as well as the bare code.
    const cleaned = code.trim().split('/').pop()!.toUpperCase();
    if (!/^[A-Z2-9]{8}$/.test(cleaned)) return setError('Invite codes are 8 letters and numbers.');
    navigate(`/join/${cleaned}`);
  };

  return (
    <form className="stack" onSubmit={onSubmit} noValidate>
      <TextField
        label="Invite code or link"
        autoCapitalize="characters"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        error={error}
      />
      <button type="submit" className="button button--quiet">
        Find group
      </button>
    </form>
  );
}

export default function Groups() {
  useDocumentTitle('Your groups');
  const [groups, reload] = useRemote<{ groups: GroupListItem[] }>('/groups');

  return (
    <div className="stack stack--lg">
      <section className="stack" aria-labelledby="groups-heading">
        <h1 id="groups-heading">Your groups</h1>
        <RemoteView state={groups} onRetry={reload}>
          {({ groups: items }) =>
            items.length === 0 ? (
              <EmptyState>
                <p>You are not in a group yet. Create one below, or join with an invite code.</p>
              </EmptyState>
            ) : (
              <ul className="list">
                {items.map((group) => (
                  <li key={group.id}>
                    <div className="list-main">
                      <Link to={`/groups/${group.id}`} className="list-title">
                        {group.name}
                      </Link>
                      <p className="muted">
                        {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                      </p>
                    </div>
                    <span
                      className={`amount ${group.netCentavos > 0 ? 'owed' : group.netCentavos < 0 ? 'owes' : 'muted'}`}
                    >
                      {describeBalance(group.netCentavos, 'you')}
                    </span>
                  </li>
                ))}
              </ul>
            )
          }
        </RemoteView>
      </section>

      <section className="stack" aria-labelledby="new-heading">
        <h2 id="new-heading">Start a group</h2>
        <NewGroupForm />
      </section>

      <section className="stack" aria-labelledby="join-heading">
        <h2 id="join-heading">Join a group</h2>
        <JoinForm />
      </section>
    </div>
  );
}
