import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { TextField } from '../../components/Field.tsx';
import { QrCode } from '../../components/QrCode.tsx';
import { fieldError, FormError, SubmitButton } from '../../components/States.tsx';
import { api } from '../../lib/api.ts';
import { useSubmission } from '../../lib/hooks.ts';
import { useUser } from '../../lib/session.tsx';
import type { Member } from '../../lib/types.ts';
import { useGroup } from './GroupPage.tsx';

function InviteSection() {
  const { group, refresh } = useGroup();
  const [submission, run] = useSubmission();
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/join/${group.inviteCode}`;

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };
  const regenerate = () => {
    if (!window.confirm('Make a new invite code? The current link will stop working.')) return;
    void run(() => api('POST', `/groups/${group.id}/invite-code`)).then((ok) => ok && refresh());
  };

  return (
    <section className="panel stack stack--sm">
      <h2>Invite people</h2>
      <p>
        Share this link or QR code, or the code <span className="code">{group.inviteCode}</span>.
      </p>
      <p className="code" style={{ overflowWrap: 'anywhere' }}>
        {link}
      </p>
      <div className="row">
        <button type="button" className="button button--quiet" onClick={() => void copy()}>
          Copy link
        </button>
        {group.role === 'admin' && (
          <button
            type="button"
            className="button button--link"
            disabled={submission.status === 'submitting'}
            onClick={regenerate}
          >
            Make a new code
          </button>
        )}
      </div>
      <QrCode
        text={link}
        label={`QR code to join ${group.name}`}
        fileName={`hati-invite-${group.inviteCode}`}
        shareText={`Join ${group.name} on Hati: ${link}`}
      />
      <p role="status">{copied && 'Link copied.'}</p>
      <FormError state={submission} />
    </section>
  );
}

function MemberRow({ member }: { member: Member }) {
  const { group, refresh } = useGroup();
  const me = useUser();
  const navigate = useNavigate();
  const [submission, run] = useSubmission();
  const isSelf = member.userId === me.id;
  const path = `/groups/${group.id}/members/${member.userId}`;
  const busy = submission.status === 'submitting';

  const setRole = (role: Member['role']) =>
    void run(() => api('PATCH', path, { role })).then((ok) => ok && refresh());
  const remove = () => {
    const question = isSelf ? `Leave ${group.name}?` : `Remove ${member.name} from the group?`;
    if (!window.confirm(question)) return;
    void run(() => api('DELETE', path)).then((ok) => {
      if (!ok) return;
      if (isSelf) navigate('/groups');
      else refresh();
    });
  };

  return (
    <li>
      <div className="list-main">
        <p className="list-title">
          {member.name}
          {isSelf && ' (you)'}
        </p>
        <p className="muted">{member.role === 'admin' ? 'Admin' : 'Member'}</p>
        {submission.status === 'failed' && (
          <p className="field-error" role="alert">
            {submission.message}
          </p>
        )}
      </div>
      <span className="row">
        {group.role === 'admin' && !isSelf && (
          <button
            type="button"
            className="button button--link"
            disabled={busy}
            onClick={() => setRole(member.role === 'admin' ? 'member' : 'admin')}
          >
            {member.role === 'admin' ? 'Make member' : 'Make admin'}
          </button>
        )}
        {(group.role === 'admin' || isSelf) && (
          <button type="button" className="button button--link" disabled={busy} onClick={remove}>
            {isSelf ? 'Leave group' : 'Remove'}
          </button>
        )}
      </span>
    </li>
  );
}

function AdminSettings() {
  const { group, refresh } = useGroup();
  const navigate = useNavigate();
  const [rename, runRename] = useSubmission();
  const [removal, runRemoval] = useSubmission();
  const [name, setName] = useState(group.name);

  const onRename = (event: FormEvent) => {
    event.preventDefault();
    void runRename(() => api('PATCH', `/groups/${group.id}`, { name })).then(
      (ok) => ok && refresh(),
    );
  };
  const onDelete = () => {
    const question = `Delete ${group.name} and all its expenses for everyone? This cannot be undone.`;
    if (!window.confirm(question)) return;
    void runRemoval(() => api('DELETE', `/groups/${group.id}`)).then(
      (ok) => ok && navigate('/groups'),
    );
  };

  return (
    <section className="stack">
      <h2>Group settings</h2>
      <form className="stack" onSubmit={onRename} noValidate>
        <TextField
          label="Group name"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldError(rename, 'name')}
        />
        <FormError state={rename} />
        <div>
          <SubmitButton state={rename} className="button button--quiet">
            Rename
          </SubmitButton>
        </div>
      </form>
      <FormError state={removal} />
      <div>
        <button
          type="button"
          className="button button--danger"
          disabled={removal.status === 'submitting'}
          onClick={onDelete}
        >
          Delete group
        </button>
      </div>
    </section>
  );
}

export function MembersTab() {
  const { group } = useGroup();
  const active = group.members.filter((m) => m.status === 'active');

  return (
    <div className="stack stack--lg">
      <InviteSection />
      <section className="stack stack--sm">
        <h2>
          {active.length} {active.length === 1 ? 'member' : 'members'}
        </h2>
        <ul className="list">
          {active.map((member) => (
            <MemberRow key={member.userId} member={member} />
          ))}
        </ul>
      </section>
      {group.role === 'admin' && <AdminSettings />}
    </div>
  );
}
