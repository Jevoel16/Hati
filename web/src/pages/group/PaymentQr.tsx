import { useState } from 'react';
import { Dialog } from '../../components/Dialog.tsx';
import { QrCode } from '../../components/QrCode.tsx';
import { RemoteView } from '../../components/States.tsx';
import { useRemote } from '../../lib/hooks.ts';
import { formatPeso } from '../../lib/money.ts';
import type { Payment, PaymentQr } from '../../lib/types.ts';
import { useGroup } from './GroupPage.tsx';

// The payee's QR Ph with the exact amount of one settle-up payment, ready to scan or share.
export default function PaymentQrDialog({
  payment,
  onClose,
}: {
  payment: Payment;
  onClose: () => void;
}) {
  const { group, nameOf } = useGroup();
  const [qr, reload] = useRemote<PaymentQr>(
    `/groups/${group.id}/payment-qr?from=${payment.fromUser}&to=${payment.toUser}`,
  );
  const payer = nameOf(payment.fromUser);
  const sentence = `${payer} ${payer === 'You' ? 'pay' : 'pays'} ${nameOf(payment.toUser, true)}`;

  return (
    <Dialog title={sentence} onClose={onClose}>
      <RemoteView state={qr} onRetry={reload}>
        {(data) => <PayWith data={data} sentence={sentence} groupName={group.name} />}
      </RemoteView>
      <div className="dialog-actions">
        <button type="button" className="button button--quiet" onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}

// The payee may have several wallets or banks; the payer picks the one they also use.
function PayWith({
  data,
  sentence,
  groupName,
}: {
  data: PaymentQr;
  sentence: string;
  groupName: string;
}) {
  const [chosenId, setChosenId] = useState(data.methods[0]!.id);
  const method = data.methods.find((m) => m.id === chosenId) ?? data.methods[0]!;
  const amount = formatPeso(data.amountCentavos);

  return (
    <div className="stack">
      <p className="figure-sm num">{amount}</p>
      {data.methods.length > 1 && (
        <fieldset className="stack stack--sm">
          <legend className="legend">Pay with</legend>
          <div className="choice-row">
            {data.methods.map((m) => (
              <label key={m.id} className="choice">
                <input
                  type="radio"
                  name="pay-with"
                  checked={m.id === method.id}
                  onChange={() => setChosenId(m.id)}
                />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <p>
        Scan with {method.label} or any InstaPay banking app. It pays{' '}
        <strong>{method.payeeName}</strong>; check the name and amount before you confirm.
      </p>
      <QrCode
        key={method.id}
        text={method.payload}
        label={`${method.label} payment QR for ${amount} to ${method.payeeName}`}
        fileName={`hati-pay-${method.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${data.amountCentavos}`}
        shareText={`${sentence} ${amount} for ${groupName}. Scan this ${method.label} QR to pay.`}
      />
      <p className="muted">
        Hati does not move money. Once it is paid, use Mark as paid to update the balances.
      </p>
    </div>
  );
}
