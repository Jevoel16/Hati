import type { Ctx } from '../context.js';
import * as groups from '../data/groups.js';
import * as ledger from '../data/ledger.js';
import type { User } from '../data/users.js';
import { toCsv } from '../domain/csv.js';
import { toMajorString } from '../domain/money.js';
import { requireGroup, requireMember } from './groups.js';

// "Unit 3B — Peña's" -> "unit-3b-pena-s", so the filename is safe in every browser and OS.
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || 'group';
}

const titleCase = (word: string) => word[0]!.toUpperCase() + word.slice(1);

// One row per expense and per payment in the month, with a share column for every member.
export async function monthlyReport(ctx: Ctx, user: User, groupId: string, month: string) {
  await requireMember(ctx.db, groupId, user.id);
  const group = await requireGroup(ctx.db, groupId);
  const [members, expenses, settlements] = await Promise.all([
    groups.listMembers(ctx.db, groupId),
    ledger.expensesInMonth(ctx.db, groupId, month),
    ledger.settlementsInMonth(ctx.db, groupId, month),
  ]);
  const money = (minor: number) => toMajorString(minor, group.currency);
  const nameOf = (userId: string) => members.find((m) => m.userId === userId)?.name ?? 'Someone';
  const blanks = members.map(() => '');

  const rows = [
    ...expenses.map((e) => ({
      date: e.spentOn,
      cells: [
        e.spentOn,
        'Expense',
        e.description,
        titleCase(e.category),
        nameOf(e.paidBy),
        money(e.amountCentavos),
        ...members.map((m) => {
          const share = e.shares.find((s) => s.userId === m.userId);
          return share ? money(share.shareCentavos) : '';
        }),
      ],
    })),
    ...settlements.map((s) => ({
      date: s.settledOn,
      cells: [
        s.settledOn,
        'Payment',
        `Paid ${nameOf(s.toUser)}`,
        '',
        nameOf(s.fromUser),
        money(s.amountCentavos),
        ...blanks,
      ],
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const header = [
    'Date',
    'Type',
    'Description',
    'Category',
    'Paid by',
    `Amount (${group.currency})`,
    ...members.map((m) => `${m.name} share`),
  ];
  return {
    filename: `hati-${slugify(group.name)}-${month}.csv`,
    csv: toCsv([header, ...rows.map((r) => r.cells)]),
  };
}
