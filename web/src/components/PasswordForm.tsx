import { useState, type FormEvent } from 'react';
import { api } from '../lib/api.ts';
import { useSubmission } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { TextField } from './Field.tsx';
import { fieldError, FormError, SubmitButton } from './States.tsx';

const MIN_LENGTH = 10;

// Changes the password on the account page. The first password is set by SetupForm.
export function PasswordForm({
  askCurrent,
  submitLabel,
  onDone,
}: {
  askCurrent: boolean;
  submitLabel: string;
  onDone?: () => void;
}) {
  const { refresh } = useSession();
  const [submission, run] = useSubmission();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [localError, setLocalError] = useState<{ password?: string; repeat?: string }>({});

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const errors = {
      password: password.length < MIN_LENGTH ? `Use at least ${MIN_LENGTH} characters.` : undefined,
      repeat: password !== repeat ? 'The two passwords do not match.' : undefined,
    };
    setLocalError(errors);
    if (errors.password || errors.repeat) return;

    const saved = await run(() =>
      api('POST', '/auth/password', {
        password,
        currentPassword: askCurrent ? current : undefined,
      }),
    );
    if (!saved) return;
    setCurrent('');
    setPassword('');
    setRepeat('');
    await refresh();
    onDone?.();
  };

  return (
    <form className="stack" onSubmit={(event) => void onSubmit(event)} noValidate>
      {askCurrent && (
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={fieldError(submission, 'currentPassword')}
        />
      )}
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${MIN_LENGTH} characters.`}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={localError.password ?? fieldError(submission, 'password')}
      />
      <TextField
        label="Repeat new password"
        type="password"
        autoComplete="new-password"
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        error={localError.repeat}
      />
      <FormError state={submission} />
      <div className="dialog-actions">
        <SubmitButton state={submission}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
