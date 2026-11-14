import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

type Common = { label: string; error?: string; hint?: string };

function Wrapper({
  id,
  label,
  error,
  hint,
  children,
}: Common & { id: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && (
        <span id={`${id}-hint`} className="muted">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}

const describedBy = (id: string, { error, hint }: Common) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export function TextField(props: Common & InputHTMLAttributes<HTMLInputElement>) {
  const { label, error, hint, ...input } = props;
  const id = useId();
  return (
    <Wrapper id={id} label={label} error={error} hint={hint}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, props)}
        {...input}
      />
    </Wrapper>
  );
}

export function SelectField(
  props: Common & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode },
) {
  const { label, error, hint, children, ...select } = props;
  const id = useId();
  return (
    <Wrapper id={id} label={label} error={error} hint={hint}>
      <select id={id} aria-describedby={describedBy(id, props)} {...select}>
        {children}
      </select>
    </Wrapper>
  );
}
