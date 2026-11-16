import { useCallback, useState } from 'react';
import { NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom';
import { RemoteView, Skeleton } from '../../components/States.tsx';
import { useDocumentTitle, useLive, useRemote } from '../../lib/hooks.ts';
import type { LiveStatus, Remote } from '../../lib/machines.ts';
import { describeBalance } from '../../lib/money.ts';
import { useUser } from '../../lib/session.tsx';
import type { Balances, Expense, Group, Payment } from '../../lib/types.ts';
import { ExpenseForm } from './ExpenseForm.tsx';
import { PaymentForm } from './PaymentForm.tsx';

// What every tab of the group page receives.
export type GroupContext = {
  group: Group;
  balances: Remote<Balances>;
  // Bumped on every change (ours or a live one); tabs pass it to their own loaders.
  refreshKey: number;
  refresh: () => void;
  // "You" at the start of a sentence, "you" inside one.
  nameOf: (userId: string, inSentence?: boolean) => string;
  editExpense: (expense: Expense) => void;
  recordPayment: (prefill?: Payment) => void;
};
export const useGroup = () => useOutletContext<GroupContext>();

type OpenDialog =
  | { kind: 'none' }
  | { kind: 'expense'; expense?: Expense }
  | { kind: 'payment'; prefill?: Payment };

const liveLabels: Record<LiveStatus, string> = {
  connecting: 'Connecting to live updates…',
  open: 'Live: changes from others appear here right away.',
  reconnecting: 'Connection lost. Reconnecting…',
  closed: 'Live updates are off. Reload the page to reconnect.',
};

const tabs = [
  { to: '.', label: 'Balances', end: true },
  { to: 'expenses', label: 'Expenses' },
  { to: 'activity', label: 'Activity' },
  { to: 'summary', label: 'Summary' },
  { to: 'members', label: 'Members' },
];

export default function GroupPage() {
  const { id = '' } = useParams();
  const me = useUser();
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);
  const [group, reloadGroup] = useRemote<Group>(`/groups/${id}`, refreshKey);
  const [balances] = useRemote<Balances>(`/groups/${id}/balances`, refreshKey);
  const live = useLive(id, refresh);
  const [dialog, setDialog] = useState<OpenDialog>({ kind: 'none' });
  useDocumentTitle(group.status === 'success' ? group.data.name : 'Group');

  const close = () => setDialog({ kind: 'none' });
  const saved = () => {
    close();
    refresh();
  };

  return (
    <RemoteView state={group} onRetry={reloadGroup} skeleton={<Skeleton hero rows={4} />}>
      {(data) => {
        const myNet =
          balances.status === 'success'
            ? (balances.data.balances.find((b) => b.userId === me.id)?.netCentavos ?? 0)
            : null;
        const context: GroupContext = {
          group: data,
          balances,
          refreshKey,
          refresh,
          nameOf: (userId, inSentence = false) =>
            userId === me.id
              ? inSentence
                ? 'you'
                : 'You'
              : (data.members.find((m) => m.userId === userId)?.name ?? 'Someone'),
          editExpense: (expense) => setDialog({ kind: 'expense', expense }),
          recordPayment: (prefill) => setDialog({ kind: 'payment', prefill }),
        };
        return (
          <div className="stack stack--lg group-layout">
            <section className="balance-hero">
              <h1>{data.name}</h1>
              {myNet === null ? (
                <span className="skeleton skeleton--hero" />
              ) : (
                <p className={`figure ${myNet > 0 ? 'owed' : myNet < 0 ? 'owes' : ''}`}>
                  {describeBalance(myNet, 'you', data.currency)}
                </p>
              )}
              <p className="live-status" role="status">
                {liveLabels[live]}
              </p>
              <div className="row">
                <button
                  type="button"
                  className="button"
                  data-tour="add-expense"
                  onClick={() => setDialog({ kind: 'expense' })}
                >
                  Add expense
                </button>
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => setDialog({ kind: 'payment' })}
                >
                  Record payment
                </button>
              </div>
            </section>

            <div className="stack">
              <nav className="tabs" aria-label="Group sections">
                {tabs.map((tab) => (
                  <NavLink key={tab.label} to={tab.to} end={tab.end}>
                    {tab.label}
                  </NavLink>
                ))}
              </nav>
              <Outlet context={context} />
            </div>

            {dialog.kind === 'expense' && (
              <ExpenseForm group={data} expense={dialog.expense} onClose={close} onSaved={saved} />
            )}
            {dialog.kind === 'payment' && (
              <PaymentForm group={data} prefill={dialog.prefill} onClose={close} onSaved={saved} />
            )}
          </div>
        );
      }}
    </RemoteView>
  );
}
