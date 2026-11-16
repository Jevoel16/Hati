import { useState, type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog.tsx';
import { SelectField, TextField } from '../../components/Field.tsx';
import { fieldError, FormError, SubmitButton } from '../../components/States.tsx';
import { api } from '../../lib/api.ts';
import { useSubmission } from '../../lib/hooks.ts';
import {
  currencySymbol,
  formatMoney,
  parseAmount,
  sampleAmount,
  todayIso,
  toAmountInput,
} from '../../lib/money.ts';
import { useUser } from '../../lib/session.tsx';
import {
  CATEGORIES,
  type Category,
  type Currency,
  type Expense,
  type ExpensePayload,
  type Group,
  type SplitInput,
  type SplitType,
} from '../../lib/types.ts';

type Errors = { description?: string; amount?: string; split?: string };

const splitLabels: Record<SplitType, string> = {
  equal: 'Equally',
  exact: 'Exact amounts',
  percent: 'Percentages',
};

// Builds the split the API expects from what was typed, or says what is wrong with it.
function buildSplit(
  type: SplitType,
  amountCentavos: number,
  included: Set<string>,
  values: Record<string, string>,
  currency: Currency,
): SplitInput | string {
  if (type === 'equal') {
    return included.size > 0
      ? { type, participants: [...included] }
      : 'Pick at least one person to split with.';
  }
  const filled = Object.entries(values).filter(([, text]) => text.trim() !== '');
  if (filled.length === 0) return 'Enter a share for at least one person.';

  if (type === 'exact') {
    const shares = filled.map(([userId, text]) => ({
      userId,
      amountCentavos: parseAmount(text, currency),
    }));
    if (shares.some((s) => s.amountCentavos === null)) return 'Each share must be an amount.';
    const total = shares.reduce((sum, s) => sum + s.amountCentavos!, 0);
    return total === amountCentavos
      ? { type, shares: shares as { userId: string; amountCentavos: number }[] }
      : `The shares add up to ${formatMoney(total, currency)}, but the expense is ${formatMoney(amountCentavos, currency)}.`;
  }

  const shares = filled.map(([userId, text]) => ({ userId, percent: Number(text) }));
  if (shares.some((s) => !Number.isFinite(s.percent) || s.percent < 0)) {
    return 'Each percentage must be a number.';
  }
  // Compared in hundredths of a percent so 33.33 + 33.33 + 33.34 is exactly 100.
  const total = shares.reduce((sum, s) => sum + Math.round(s.percent * 100), 0);
  return total === 10_000
    ? { type, shares }
    : `The percentages add up to ${total / 100}%, not 100%.`;
}

export function ExpenseForm({
  group,
  expense,
  onClose,
  onSaved,
}: {
  group: Group;
  expense?: Expense;
  onClose: () => void;
  onSaved: () => void;
}) {
  const me = useUser();
  const { currency } = group;
  const members = group.members.filter((m) => m.status === 'active');
  const [submission, run] = useSubmission();
  const [errors, setErrors] = useState<Errors>({});

  const [description, setDescription] = useState(expense?.description ?? '');
  const [amount, setAmount] = useState(
    expense ? toAmountInput(expense.amountCentavos, currency) : '',
  );
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? me.id);
  const [spentOn, setSpentOn] = useState(expense?.spentOn ?? todayIso());
  const [category, setCategory] = useState<Category>(expense?.category ?? 'food');
  // A saved percentage split comes back as amounts, so it is edited as exact amounts.
  const [splitType, setSplitType] = useState<SplitType>(
    !expense || expense.splitType === 'equal' ? 'equal' : 'exact',
  );
  const [included, setIncluded] = useState(
    () => new Set(expense ? expense.shares.map((s) => s.userId) : members.map((m) => m.userId)),
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    expense && expense.splitType !== 'equal'
      ? Object.fromEntries(
          expense.shares.map((s) => [s.userId, toAmountInput(s.shareCentavos, currency)]),
        )
      : {},
  );

  const changeSplitType = (type: SplitType) => {
    setSplitType(type);
    setValues({});
  };
  const toggle = (userId: string) =>
    setIncluded((current) => {
      const next = new Set(current);
      if (!next.delete(userId)) next.add(userId);
      return next;
    });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const amountCentavos = parseAmount(amount, currency);
    const split =
      amountCentavos === null || amountCentavos === 0
        ? undefined
        : buildSplit(splitType, amountCentavos, included, values, currency);
    const found: Errors = {
      description: description.trim() ? undefined : 'Say what this was for.',
      amount: amountCentavos ? undefined : `Enter an amount, like ${sampleAmount(currency)}.`,
      split: typeof split === 'string' ? split : undefined,
    };
    setErrors(found);
    if (found.description || found.amount || !split || typeof split === 'string') return;

    const payload: ExpensePayload = {
      description: description.trim(),
      amountCentavos: amountCentavos!,
      category,
      spentOn,
      paidBy,
      split,
    };
    void run(() =>
      expense
        ? api('PUT', `/groups/${group.id}/expenses/${expense.id}`, payload)
        : api('POST', `/groups/${group.id}/expenses`, payload),
    ).then((ok) => ok && onSaved());
  };

  const splitError = errors.split ?? fieldError(submission, 'split');

  return (
    <Dialog title={expense ? 'Edit expense' : 'Add expense'} onClose={onClose}>
      <form className="stack" onSubmit={onSubmit} noValidate>
        <TextField
          label="What was it for?"
          maxLength={120}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description ?? fieldError(submission, 'description')}
        />
        <TextField
          label={`Amount (${currencySymbol(currency)})`}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errors.amount ?? fieldError(submission, 'amountCentavos')}
        />
        <SelectField
          label="Paid by"
          value={paidBy}
          onChange={(e) => setPaidBy(e.target.value)}
          error={fieldError(submission, 'paidBy')}
        >
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.userId === me.id ? `${m.name} (you)` : m.name}
            </option>
          ))}
        </SelectField>
        <div className="row">
          <TextField
            label="Date"
            type="date"
            value={spentOn}
            max={todayIso()}
            onChange={(e) => setSpentOn(e.target.value)}
            error={fieldError(submission, 'spentOn')}
          />
          <SelectField
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c[0]!.toUpperCase() + c.slice(1)}
              </option>
            ))}
          </SelectField>
        </div>

        <fieldset className="stack stack--sm">
          <legend className="legend">Split</legend>
          <div className="choice-row">
            {(Object.keys(splitLabels) as SplitType[]).map((type) => (
              <label key={type} className="choice">
                <input
                  type="radio"
                  name="split-type"
                  checked={splitType === type}
                  onChange={() => changeSplitType(type)}
                />
                {splitLabels[type]}
              </label>
            ))}
          </div>
          {members.map((m) =>
            splitType === 'equal' ? (
              <label key={m.userId} className="choice">
                <input
                  type="checkbox"
                  checked={included.has(m.userId)}
                  onChange={() => toggle(m.userId)}
                />
                {m.name}
              </label>
            ) : (
              <label key={m.userId} className="split-row field">
                <span>{m.name}</span>
                <input
                  inputMode="decimal"
                  aria-label={`${m.name}: ${splitType === 'exact' ? `share in ${currency}` : 'percentage'}`}
                  placeholder={splitType === 'exact' ? toAmountInput(0, currency) : '0'}
                  value={values[m.userId] ?? ''}
                  onChange={(e) => setValues({ ...values, [m.userId]: e.target.value })}
                />
              </label>
            ),
          )}
          <div role="alert">{splitError && <p className="field-error">{splitError}</p>}</div>
        </fieldset>

        <FormError state={submission} />
        <div className="dialog-actions">
          <button type="button" className="button button--quiet" onClick={onClose}>
            Cancel
          </button>
          <SubmitButton state={submission}>{expense ? 'Save changes' : 'Add expense'}</SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}
