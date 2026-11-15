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
        {(data) => (
          <div className="stack">
            <p className="figure-sm num">{formatPeso(data.amountCentavos)}</p>
            <p>
              Scan with GCash, Maya or any InstaPay banking app. It pays{' '}
              <strong>{data.payeeName}</strong>; check the name and amount before you confirm.
            </p>
            <QrCode
              text={data.payload}
              label={`Payment QR for ${formatPeso(data.amountCentavos)} to ${data.payeeName}`}
              fileName={`hati-pay-${data.amountCentavos}`}
              shareText={`${sentence} ${formatPeso(data.amountCentavos)} for ${group.name}. Scan this QR to pay.`}
            />
            <p className="muted">
              Hati does not move money. Once it is paid, use Mark as paid to update the balances.
            </p>
          </div>
        )}
      </RemoteView>
      <div className="dialog-actions">
        <button type="button" className="button button--quiet" onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
