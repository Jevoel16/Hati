import type { Ctx } from '../context.js';
import * as activity from '../data/activity.js';
import * as groups from '../data/groups.js';
import type { Member, Membership } from '../data/groups.js';
import * as ledger from '../data/ledger.js';
import type { SettlementInput } from '../data/ledger.js';
import type { User } from '../data/users.js';
import type { Category } from '../domain/money.js';
import { formatPeso } from '../domain/money.js';
import {
  SplitError,
  splitByPercent,
  splitEqually,
  splitExact,
  type Share,
} from '../domain/split.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import { requireMember } from './groups.js';

export type SplitInput =
  | { type: 'equal'; participants: string[] }
  | { type: 'exact'; shares: { userId: string; amountCentavos: number }[] }
  | { type: 'percent'; shares: { userId: string; percent: number }[] };

export type ExpensePayload = {
  description: string;
  amountCentavos: number;
  category: Category;
  spentOn: string;
  paidBy: string;
  split: SplitInput;
};

export type Page = { limit: number; offset: number };

function toBasisPoints(percent: number): number {
  const basisPoints = Math.round(percent * 100);
  if (Math.abs(percent * 100 - basisPoints) > 1e-6) {
    throw new SplitError('Percentages can have at most two decimals.');
  }
  return basisPoints;
}

function buildShares(amountCentavos: number, split: SplitInput): Share[] {
  try {
    switch (split.type) {
      case 'equal':
        return splitEqually(amountCentavos, split.participants);
      case 'exact':
        return splitExact(amountCentavos, split.shares);
      case 'percent':
        return splitByPercent(
          amountCentavos,
          split.shares.map((s) => ({ userId: s.userId, basisPoints: toBasisPoints(s.percent) })),
        );
    }
  } catch (error) {
    if (error instanceof SplitError) throw badRequest(error.message, { split: error.message });
    throw error;
  }
}

function requireActiveMembers(members: Member[], userIds: string[], field: string): void {
  const active = new Set(members.filter((m) => m.status === 'active').map((m) => m.userId));
  if (!userIds.every((id) => active.has(id))) {
    const message = 'Everyone in an expense must be a current member of the group.';
    throw badRequest(message, { [field]: message });
  }
}

// Used for both create (no expenseId) and edit, so the two can never drift apart.
async function saveExpense(
  ctx: Ctx,
  user: User,
  groupId: string,
  payload: ExpensePayload,
  expenseId?: string,
): Promise<string> {
  const shares = buildShares(payload.amountCentavos, payload.split);
  const input = { ...payload, splitType: payload.split.type };

  return ctx.db.transaction(async (tx) => {
    const membership = await requireMember(tx, groupId, user.id);
    const members = await groups.listMembers(tx, groupId);
    requireActiveMembers(members, [payload.paidBy], 'paidBy');
    requireActiveMembers(
      members,
      shares.map((s) => s.userId),
      'split',
    );

    let id = expenseId;
    if (id) {
      const existing = await ledger.findExpense(tx, groupId, id);
      if (!existing) throw notFound('Expense');
      requireOwnerOrAdmin(membership, user, [existing.createdBy, existing.paidBy]);
      await ledger.updateExpense(tx, id, input);
    } else {
      id = await ledger.insertExpense(tx, groupId, user.id, input);
    }
    await ledger.replaceShares(tx, id, shares);
    if (!(await ledger.sharesMatchAmount(tx, id))) {
      throw new Error(`Shares of expense ${id} do not add up to its amount.`);
    }
    await activity.record(tx, {
      groupId,
      actorId: user.id,
      action: expenseId ? 'expense_edited' : 'expense_added',
      summary: `${expenseId ? 'edited' : 'added'} "${payload.description}" for ${formatPeso(payload.amountCentavos)}`,
    });
    return id;
  });
}

function requireOwnerOrAdmin(membership: Membership, user: User, ownerIds: string[]): void {
  if (membership.role !== 'admin' && !ownerIds.includes(user.id)) {
    throw forbidden('Only the people involved or a group admin can change this.');
  }
}

export const createExpense = (ctx: Ctx, user: User, groupId: string, payload: ExpensePayload) =>
  saveExpense(ctx, user, groupId, payload);

export const updateExpense = (
  ctx: Ctx,
  user: User,
  groupId: string,
  expenseId: string,
  payload: ExpensePayload,
) => saveExpense(ctx, user, groupId, payload, expenseId);

export async function deleteExpense(ctx: Ctx, user: User, groupId: string, expenseId: string) {
  await ctx.db.transaction(async (tx) => {
    const membership = await requireMember(tx, groupId, user.id);
    const expense = await ledger.findExpense(tx, groupId, expenseId);
    if (!expense) throw notFound('Expense');
    requireOwnerOrAdmin(membership, user, [expense.createdBy, expense.paidBy]);
    await ledger.removeExpense(tx, expenseId);
    await activity.record(tx, {
      groupId,
      actorId: user.id,
      action: 'expense_deleted',
      summary: `deleted "${expense.description}" (${formatPeso(expense.amountCentavos)})`,
    });
  });
}

// Asks for one row more than the page, to know whether another page exists.
async function paginate<T>(page: Page, load: (limit: number, offset: number) => Promise<T[]>) {
  const rows = await load(page.limit + 1, page.offset);
  const hasMore = rows.length > page.limit;
  return {
    items: rows.slice(0, page.limit),
    nextOffset: hasMore ? page.offset + page.limit : null,
  };
}

export async function listExpenses(ctx: Ctx, user: User, groupId: string, page: Page) {
  await requireMember(ctx.db, groupId, user.id);
  return paginate(page, (limit, offset) => ledger.listExpenses(ctx.db, groupId, limit, offset));
}

export async function listSettlements(ctx: Ctx, user: User, groupId: string, page: Page) {
  await requireMember(ctx.db, groupId, user.id);
  return paginate(page, (limit, offset) => ledger.listSettlements(ctx.db, groupId, limit, offset));
}

export async function listActivity(ctx: Ctx, user: User, groupId: string, page: Page) {
  await requireMember(ctx.db, groupId, user.id);
  return paginate(page, (limit, offset) => activity.list(ctx.db, groupId, limit, offset));
}

export async function getSummary(ctx: Ctx, user: User, groupId: string) {
  await requireMember(ctx.db, groupId, user.id);
  const [byCategory, byMonth] = await Promise.all([
    ledger.totalsByCategory(ctx.db, groupId),
    ledger.totalsByMonth(ctx.db, groupId),
  ]);
  return { byCategory, byMonth };
}

export async function createSettlement(
  ctx: Ctx,
  user: User,
  groupId: string,
  input: SettlementInput,
): Promise<string> {
  if (input.fromUser === input.toUser) {
    throw badRequest('Pick two different people.', { toUser: 'Pick two different people.' });
  }
  return ctx.db.transaction(async (tx) => {
    const membership = await requireMember(tx, groupId, user.id);
    requireOwnerOrAdmin(membership, user, [input.fromUser, input.toUser]);
    // People who left can still be paid back, so any past or present member is accepted.
    const members = await groups.listMembers(tx, groupId);
    const from = members.find((m) => m.userId === input.fromUser);
    const to = members.find((m) => m.userId === input.toUser);
    if (!from || !to) {
      const message = 'Both people must belong to the group.';
      throw badRequest(message, { toUser: message });
    }
    const id = await ledger.insertSettlement(tx, groupId, user.id, input);
    await activity.record(tx, {
      groupId,
      actorId: user.id,
      action: 'settlement_added',
      summary: `recorded a ${formatPeso(input.amountCentavos)} payment from ${from.name} to ${to.name}`,
    });
    return id;
  });
}

export async function deleteSettlement(
  ctx: Ctx,
  user: User,
  groupId: string,
  settlementId: string,
) {
  await ctx.db.transaction(async (tx) => {
    const membership = await requireMember(tx, groupId, user.id);
    const settlement = await ledger.findSettlement(tx, groupId, settlementId);
    if (!settlement) throw notFound('Payment');
    requireOwnerOrAdmin(membership, user, [settlement.createdBy]);
    await ledger.removeSettlement(tx, settlementId);
    await activity.record(tx, {
      groupId,
      actorId: user.id,
      action: 'settlement_deleted',
      summary: `deleted a ${formatPeso(settlement.amountCentavos)} payment`,
    });
  });
}
