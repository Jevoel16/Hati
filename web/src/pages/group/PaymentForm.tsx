import { useState, type FormEvent } from 'react';
import { Dialog } from '../../components/Dialog.tsx';
import { SelectField, TextField } from '../../components/Field.tsx';
import { fieldError, FormError, SubmitButton } from '../../components/States.tsx';
import { api } from '../../lib/api.ts';
import { useSubmission } from '../../lib/hooks.ts';
import { parsePesos, todayIso, toPesoInput } from '../../lib/money.ts';
import { useUser } from '../../lib/session.tsx';
import type { Group, Payment } from '../../lib/types.ts';

export function PaymentForm({
  group,
  prefill,
  onClose,
  onSaved,
}: {
  group: Group;
  prefill?: Payment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const me = useUser();
  const [submission, run] = useSubmission();
  const others = group.members.filter((m) => m.userId !== me.id);
  const [fromUser, setFromUser] = useState(prefill?.fromUser ?? me.id);
  const [toUser, setToUser] = useState(prefill?.toUser ?? others[0]?.userId ?? '');
  const [amount, setAmount] = useState(prefill ? toPesoInput(prefill.amountCentavos) : '');
  const [settledOn, setSettledOn] = useState(todayIso());
  const [amountError, setAmountError] = useState<string>();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const amountCentavos = parsePesos(amount);
    setAmountError(amountCentavos ? undefined : 'Enter an amount in pesos, like 500.');
    if (!amountCentavos) return;
    void run(() =>
      api('POST', `/groups/${group.id}/settlements`, {
        fromUser,
        toUser,
        amountCentavos,
        settledOn,
      }),
    ).then((ok) => ok && onSaved());
  };

  const options = group.members.map((m) => (
    <option key={m.userId} value={m.userId}>
      {m.userId === me.id ? `${m.name} (you)` : m.name}
    </option>
  ));

  return (
    <Dialog title="Record a payment" onClose={onClose}>
      <form className="stack" onSubmit={onSubmit} noValidate>
        <p className="muted">
          Hati does not move money. Record a payment after it has been made in cash or by transfer.
        </p>
        <SelectField
          label="Who paid"
          value={fromUser}
          onChange={(e) => setFromUser(e.target.value)}
        >
          {options}
        </SelectField>
        <SelectField
          label="Who received it"
          value={toUser}
          onChange={(e) => setToUser(e.target.value)}
          error={fieldError(submission, 'toUser')}
        >
          {options}
        </SelectField>
        <TextField
          label="Amount (₱)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={amountError ?? fieldError(submission, 'amountCentavos')}
        />
        <TextField
          label="Date"
          type="date"
          value={settledOn}
          max={todayIso()}
          onChange={(e) => setSettledOn(e.target.value)}
        />
        <FormError state={submission} />
        <div className="dialog-actions">
          <button type="button" className="button button--quiet" onClick={onClose}>
            Cancel
          </button>
          <SubmitButton state={submission}>Record payment</SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}
