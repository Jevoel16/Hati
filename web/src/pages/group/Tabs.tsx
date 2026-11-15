import { lazy, Suspense, useState, type ReactNode } from 'react';
import { EmptyState, RemoteView } from '../../components/States.tsx';
import { api } from '../../lib/api.ts';
import { usePagedList, useRemote, useSubmission } from '../../lib/hooks.ts';
import { describeBalance, formatDay, formatMonth, formatPeso } from '../../lib/money.ts';
import { useUser } from '../../lib/session.tsx';
import type { ActivityEntry, Expense, Payment, Settlement, Summary } from '../../lib/types.ts';
import { useGroup } from './GroupPage.tsx';

// The QR encoder loads only when someone opens a payment QR.
const PaymentQrDialog = lazy(() => import('./PaymentQr.tsx'));

const balanceClass = (net: number) => (net > 0 ? 'owed' : net < 0 ? 'owes' : 'muted');

function LoadMore({ list }: { list: { loadMore: () => void; loadingMore: boolean } }) {
  return (
    <div>
      <button
        type="button"
        className="button button--quiet"
        disabled={list.loadingMore}
        onClick={list.loadMore}
      >
        {list.loadingMore ? 'Loading…' : 'Show more'}
      </button>
    </div>
  );
}

// A delete button that confirms first and reports a failure next to itself.
function DeleteButton({
  label,
  path,
  onDone,
}: {
  label: string;
  path: string;
  onDone: () => void;
}) {
  const [submission, run] = useSubmission();
  const remove = () => {
    if (!window.confirm(`${label}? This cannot be undone.`)) return;
    void run(() => api('DELETE', path)).then((ok) => ok && onDone());
  };
  return (
    <>
      <button
        type="button"
        className="button button--link"
        disabled={submission.status === 'submitting'}
        onClick={remove}
      >
        Delete
      </button>
      {submission.status === 'failed' && (
        <span className="field-error" role="alert">
          {submission.message}
        </span>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="stack stack--sm">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function BalancesTab() {
  const { group, balances, refreshKey, refresh, nameOf, recordPayment } = useGroup();
  const me = useUser();
  const payments = usePagedList<Settlement>(`/groups/${group.id}/settlements`, refreshKey);
  const canRecord = (ids: string[]) => group.role === 'admin' || ids.includes(me.id);
  const hasQr = (userId: string) =>
    group.members.some((m) => m.userId === userId && m.hasPaymentQr);
  const [showing, setShowing] = useState<Payment | null>(null);
  // People who left stay listed only while they still owe or are owed something.
  const isShown = (b: { userId: string; netCentavos: number }) =>
    b.netCentavos !== 0 ||
    group.members.some((m) => m.userId === b.userId && m.status === 'active');

  return (
    <div className="stack stack--lg">
      <RemoteView state={balances} onRetry={refresh}>
        {(data) => (
          <>
            <Section title="Everyone’s balance">
              <ul className="list">
                {data.balances.filter(isShown).map((b) => (
                  <li key={b.userId}>
                    <span className="list-title">{nameOf(b.userId)}</span>
                    <span className={`amount ${balanceClass(b.netCentavos)}`}>
                      {b.userId === me.id
                        ? describeBalance(b.netCentavos, 'you')
                        : describeBalance(b.netCentavos, 'they')}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Fewest payments to settle up">
              {data.payments.length === 0 ? (
                <EmptyState>
                  <p>Nobody owes anything right now.</p>
                </EmptyState>
              ) : (
                <ul className="list">
                  {data.payments.map((p) => (
                    <li key={`${p.fromUser}-${p.toUser}`}>
                      <span className="list-main">
                        {nameOf(p.fromUser)} {p.fromUser === me.id ? 'pay' : 'pays'}{' '}
                        {nameOf(p.toUser, true)}{' '}
                        <span className="amount">{formatPeso(p.amountCentavos)}</span>
                      </span>
                      <span className="row">
                        {hasQr(p.toUser) && (
                          <button
                            type="button"
                            className="button button--quiet"
                            onClick={() => setShowing(p)}
                          >
                            Show QR
                          </button>
                        )}
                        {canRecord([p.fromUser, p.toUser]) && (
                          <button
                            type="button"
                            className="button button--quiet"
                            onClick={() => recordPayment(p)}
                          >
                            Mark as paid
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </RemoteView>

      <Section title="Recorded payments">
        <RemoteView state={payments.state} onRetry={payments.reload}>
          {(page) =>
            page.items.length === 0 ? (
              <EmptyState>
                <p>No payments recorded yet.</p>
              </EmptyState>
            ) : (
              <>
                <ul className="list">
                  {page.items.map((s) => (
                    <li key={s.id}>
                      <div className="list-main">
                        <p>
                          {nameOf(s.fromUser)} paid {nameOf(s.toUser, true)}
                        </p>
                        <p className="muted">{formatDay(s.settledOn)}</p>
                      </div>
                      <span className="amount">{formatPeso(s.amountCentavos)}</span>
                      {canRecord([s.createdBy]) && (
                        <DeleteButton
                          label="Delete this payment"
                          path={`/groups/${group.id}/settlements/${s.id}`}
                          onDone={refresh}
                        />
                      )}
                    </li>
                  ))}
                </ul>
                {page.nextOffset !== null && <LoadMore list={payments} />}
              </>
            )
          }
        </RemoteView>
      </Section>

      {showing && (
        <Suspense fallback={null}>
          <PaymentQrDialog payment={showing} onClose={() => setShowing(null)} />
        </Suspense>
      )}
    </div>
  );
}

export function ExpensesTab() {
  const { group, refreshKey, refresh, nameOf, editExpense } = useGroup();
  const me = useUser();
  const expenses = usePagedList<Expense>(`/groups/${group.id}/expenses`, refreshKey);
  const canChange = (e: Expense) =>
    group.role === 'admin' || e.createdBy === me.id || e.paidBy === me.id;

  return (
    <RemoteView state={expenses.state} onRetry={expenses.reload}>
      {(page) =>
        page.items.length === 0 ? (
          <EmptyState>
            <p>No expenses yet. Add the first one with the button above.</p>
          </EmptyState>
        ) : (
          <div className="stack">
            <ul className="list">
              {page.items.map((e) => {
                const myShare = e.shares.find((s) => s.userId === me.id)?.shareCentavos ?? 0;
                return (
                  <li key={e.id}>
                    <div className="list-main">
                      <p className="list-title">{e.description}</p>
                      <p className="muted">
                        {formatDay(e.spentOn)} · {e.category} · {nameOf(e.paidBy)} paid · your share{' '}
                        {formatPeso(myShare)}
                      </p>
                    </div>
                    <span className="amount">{formatPeso(e.amountCentavos)}</span>
                    {canChange(e) && (
                      <span className="row">
                        <button
                          type="button"
                          className="button button--link"
                          onClick={() => editExpense(e)}
                        >
                          Edit
                        </button>
                        <DeleteButton
                          label={`Delete “${e.description}”`}
                          path={`/groups/${group.id}/expenses/${e.id}`}
                          onDone={refresh}
                        />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {page.nextOffset !== null && <LoadMore list={expenses} />}
          </div>
        )
      }
    </RemoteView>
  );
}

const timeFormat = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

export function ActivityTab() {
  const { group, refreshKey } = useGroup();
  const activity = usePagedList<ActivityEntry>(`/groups/${group.id}/activity`, refreshKey);

  return (
    <RemoteView state={activity.state} onRetry={activity.reload}>
      {(page) => (
        <div className="stack">
          <ul className="list">
            {page.items.map((a) => (
              <li key={a.id}>
                <p className="list-main">
                  <strong>{a.actorName}</strong> {a.summary}
                </p>
                <time className="muted" dateTime={a.createdAt}>
                  {timeFormat.format(new Date(a.createdAt))}
                </time>
              </li>
            ))}
          </ul>
          {page.nextOffset !== null && <LoadMore list={activity} />}
        </div>
      )}
    </RemoteView>
  );
}

function Totals({ rows }: { rows: { label: string; totalCentavos: number }[] }) {
  const largest = Math.max(...rows.map((r) => r.totalCentavos), 1);
  return (
    <ul className="list">
      {rows.map((row) => (
        <li key={row.label}>
          <span className="list-title">{row.label}</span>
          <span className="amount">{formatPeso(row.totalCentavos)}</span>
          <span className="bar-track" aria-hidden="true">
            <span
              className="bar-fill"
              style={{ display: 'block', width: `${(row.totalCentavos / largest) * 100}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SummaryTab() {
  const { group, refreshKey } = useGroup();
  const [summary, reload] = useRemote<Summary>(`/groups/${group.id}/summary`, refreshKey);

  return (
    <RemoteView state={summary} onRetry={reload}>
      {(data) =>
        data.byCategory.length === 0 ? (
          <EmptyState>
            <p>The summary appears once the group has expenses.</p>
          </EmptyState>
        ) : (
          <div className="stack stack--lg">
            <Section title="Spending by category">
              <Totals
                rows={data.byCategory.map((c) => ({
                  label: c.category[0]!.toUpperCase() + c.category.slice(1),
                  totalCentavos: c.totalCentavos,
                }))}
              />
            </Section>
            <Section title="Spending by month">
              <Totals
                rows={data.byMonth.map((m) => ({
                  label: formatMonth(m.month),
                  totalCentavos: m.totalCentavos,
                }))}
              />
            </Section>
          </div>
        )
      }
    </RemoteView>
  );
}
