// A positive net means the group owes this person; a negative net means they owe the group.
export type Balance = { userId: string; netCentavos: number };
export type Payment = { fromUser: string; toUser: string; amountCentavos: number };
export type Delta = { userId: string; deltaCentavos: number };

// Deltas: +amount for paying an expense or sending a settlement,
// -amount for a share of an expense or receiving a settlement.
export function computeBalances(userIds: string[], deltas: Delta[]): Balance[] {
  const net = new Map<string, number>(userIds.map((id) => [id, 0]));
  for (const { userId, deltaCentavos } of deltas) {
    net.set(userId, (net.get(userId) ?? 0) + deltaCentavos);
  }
  const balances = [...net].map(([userId, netCentavos]) => ({ userId, netCentavos }));
  const total = balances.reduce((sum, b) => sum + b.netCentavos, 0);
  if (total !== 0) throw new Error(`Balances must sum to zero but sum to ${total}.`);
  return balances;
}

// Greedy: the person who owes most pays the person owed most, until everyone is at zero.
// At most n-1 payments. The true minimum is NP-hard (see docs/decisions.md).
export function simplifyDebts(balances: Balance[]): Payment[] {
  const byAmountThenId = (a: Balance, b: Balance) =>
    Math.abs(b.netCentavos) - Math.abs(a.netCentavos) || a.userId.localeCompare(b.userId);
  const debtors = balances.filter((b) => b.netCentavos < 0).map((b) => ({ ...b }));
  const creditors = balances.filter((b) => b.netCentavos > 0).map((b) => ({ ...b }));
  const payments: Payment[] = [];

  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(byAmountThenId);
    creditors.sort(byAmountThenId);
    const debtor = debtors[0]!;
    const creditor = creditors[0]!;
    const amountCentavos = Math.min(-debtor.netCentavos, creditor.netCentavos);
    payments.push({ fromUser: debtor.userId, toUser: creditor.userId, amountCentavos });
    debtor.netCentavos += amountCentavos;
    creditor.netCentavos -= amountCentavos;
    if (debtor.netCentavos === 0) debtors.shift();
    if (creditor.netCentavos === 0) creditors.shift();
  }
  return payments;
}
