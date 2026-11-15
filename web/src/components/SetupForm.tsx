import { useState, type FormEvent } from 'react';
import { api } from '../lib/api.ts';
import { useSubmission } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { TextField } from './Field.tsx';
import { fieldError, FormError, SubmitButton } from './States.tsx';

const MIN_LENGTH = 10;
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const USERNAME_HINT = '3 to 20 lowercase letters, numbers or underscores. It cannot be changed.';

// Account setup: a username always, and the first password when the account has none.
export function SetupForm({ needsPassword }: { needsPassword: boolean }) {
  const { refresh } = useSession();
  const [submission, run] = useSubmission();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [localError, setLocalError] = useState<{
    username?: string;
    password?: string;
    repeat?: string;
  }>({});

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const name = username.trim().toLowerCase();
    const errors = {
      username: USERNAME_PATTERN.test(name) ? undefined : USERNAME_HINT,
      password:
        needsPassword && password.length < MIN_LENGTH
          ? `Use at least ${MIN_LENGTH} characters.`
          : undefined,
      repeat: needsPassword && password !== repeat ? 'The two passwords do not match.' : undefined,
    };
    setLocalError(errors);
    if (errors.username || errors.password || errors.repeat) return;

    const saved = await run(() =>
      api('POST', '/auth/setup', {
        username: name,
        password: needsPassword ? password : undefined,
      }),
    );
    if (saved) await refresh();
  };

  return (
    <form className="stack" onSubmit={(event) => void onSubmit(event)} noValidate>
      <TextField
        label="Username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={20}
        hint={USERNAME_HINT}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        error={localError.username ?? fieldError(submission, 'username')}
      />
      {needsPassword && (
        <>
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            hint={`At least ${MIN_LENGTH} characters.`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={localError.password ?? fieldError(submission, 'password')}
          />
          <TextField
            label="Repeat password"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            error={localError.repeat}
          />
        </>
      )}
      <FormError state={submission} />
      <div className="dialog-actions">
        <SubmitButton state={submission}>Save and continue</SubmitButton>
      </div>
    </form>
  );
}
