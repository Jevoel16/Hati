import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { currencySymbol } from '../lib/money.ts';
import { CURRENCIES, type Currency } from '../lib/types.ts';

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

// Used when a group is created and in its settings until the first expense.
export function CurrencyField({
  value,
  onChange,
  error,
}: {
  value: Currency;
  onChange: (currency: Currency) => void;
  error?: string;
}) {
  return (
    <SelectField
      label="Currency"
      hint="Every amount in the group uses it. Payment QRs work in peso groups only."
      value={value}
      onChange={(e) => onChange(e.target.value as Currency)}
      error={error}
    >
      {(Object.keys(CURRENCIES) as Currency[]).map((code) => (
        <option key={code} value={code}>
          {CURRENCIES[code]} ({currencySymbol(code)})
        </option>
      ))}
    </SelectField>
  );
}
