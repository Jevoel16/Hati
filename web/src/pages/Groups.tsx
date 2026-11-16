import { lazy, Suspense, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CurrencyField, TextField } from '../components/Field.tsx';
import {
  EmptyState,
  fieldError,
  FormError,
  RemoteView,
  SubmitButton,
} from '../components/States.tsx';
import { api } from '../lib/api.ts';
import { useDocumentTitle, useRemote, useSubmission } from '../lib/hooks.ts';
import { parseInviteCode } from '../lib/invite.ts';
import { describeBalance } from '../lib/money.ts';
import type { Currency, GroupListItem } from '../lib/types.ts';

// The scanner and its QR decoder load only when someone opens it.
const QrScanner = lazy(() => import('../components/QrScanner.tsx'));

function NewGroupForm() {
  const navigate = useNavigate();
  const [submission, run] = useSubmission();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<Currency>('PHP');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const { id } = await api<{ id: string }>('POST', '/groups', { name, currency });
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
      <CurrencyField
        value={currency}
        onChange={setCurrency}
        error={fieldError(submission, 'currency')}
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
  const [scanning, setScanning] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const cleaned = parseInviteCode(code);
    if (!cleaned) return setError('Invite codes are 8 letters and numbers.');
    navigate(`/join/${cleaned}`);
  };
  const onScan = (text: string) => {
    setScanning(false);
    const cleaned = parseInviteCode(text);
    if (cleaned) navigate(`/join/${cleaned}`);
    else setError('That QR code is not a Hati invite.');
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
      <div className="row">
        <button type="submit" className="button button--quiet">
          Find group
        </button>
        <button type="button" className="button button--quiet" onClick={() => setScanning(true)}>
          Scan QR code
        </button>
      </div>
      {scanning && (
        <Suspense fallback={null}>
          <QrScanner
            title="Scan an invite"
            hint="Scan the QR code on the group’s Members tab, or choose a screenshot of it."
            onScan={onScan}
            onClose={() => setScanning(false)}
          />
        </Suspense>
      )}
    </form>
  );
}

export default function Groups() {
  useDocumentTitle('Your groups');
  const [groups, reload] = useRemote<{ groups: GroupListItem[] }>('/groups');

  return (
    <div className="stack stack--lg groups-layout">
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
                      {describeBalance(group.netCentavos, 'you', group.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )
          }
        </RemoteView>
      </section>

      <section className="stack" aria-labelledby="new-heading" data-tour="new-group">
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
