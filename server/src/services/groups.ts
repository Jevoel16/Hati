import { randomInt } from 'node:crypto';
import type { Ctx } from '../context.js';
import * as activity from '../data/activity.js';
import * as groups from '../data/groups.js';
import type { Role } from '../data/groups.js';
import * as ledger from '../data/ledger.js';
import type { User } from '../data/users.js';
import type { Queryable } from '../db.js';
import { computeBalances, simplifyDebts } from '../domain/balances.js';
import { transitionMember } from '../domain/machines.js';
import type { Currency } from '../domain/money.js';
import { conflict, forbidden, notFound } from '../errors.js';

// No 0/O or 1/I/L, so a code read aloud or copied by hand is unambiguous.
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_PATTERN = /^[A-HJKMNP-Z2-9]{8}$/;

const newInviteCode = () =>
  Array.from({ length: 8 }, () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]).join('');

// A non-member gets the same 404 as a missing group, so ids cannot be probed.
export async function requireMember(q: Queryable, groupId: string, userId: string) {
  const membership = await groups.findMembership(q, groupId, userId);
  if (membership?.status !== 'active') throw notFound('Group');
  return membership;
}

export async function requireAdmin(q: Queryable, groupId: string, userId: string) {
  const membership = await requireMember(q, groupId, userId);
  if (membership.role !== 'admin') throw forbidden('Only a group admin can do that.');
  return membership;
}

export async function groupBalances(q: Queryable, groupId: string) {
  const members = await groups.listMembers(q, groupId);
  const balances = computeBalances(
    members.map((m) => m.userId),
    await ledger.balanceDeltas(q, groupId),
  );
  return { members, balances };
}

async function requireSettled(q: Queryable, groupId: string, userId: string, who: string) {
  const { balances } = await groupBalances(q, groupId);
  if (balances.find((b) => b.userId === userId)?.netCentavos !== 0) {
    throw conflict(`${who} must settle up before leaving the group.`);
  }
}

export async function createGroup(
  ctx: Ctx,
  user: User,
  input: { name: string; currency: Currency },
): Promise<string> {
  return ctx.db.transaction(async (tx) => {
    const groupId = await groups.insert(tx, {
      ...input,
      inviteCode: newInviteCode(),
      createdBy: user.id,
    });
    await groups.addMember(tx, groupId, user.id, 'admin');
    await activity.record(tx, {
      groupId,
      actorId: user.id,
      action: 'group_created',
      summary: 'created the group',
    });
    return groupId;
  });
}

export const listGroups = (ctx: Ctx, user: User) => groups.listForUser(ctx.db, user.id);

export async function getGroup(ctx: Ctx, user: User, groupId: string) {
  const membership = await requireMember(ctx.db, groupId, user.id);
  const group = await requireGroup(ctx.db, groupId);
  return {
    id: group.id,
    name: group.name,
    inviteCode: group.inviteCode,
    currency: group.currency,
    currencyLocked: await ledger.hasEntries(ctx.db, groupId),
    role: membership.role,
    members: await groups.listMembers(ctx.db, groupId),
  };
}

// Used by every write that needs the group's currency (activity summaries, reports, QRs).
export async function requireGroup(q: Queryable, groupId: string) {
  const group = await groups.findById(q, groupId);
  if (!group) throw notFound('Group');
  return group;
}

export async function getBalances(ctx: Ctx, user: User, groupId: string) {
  await requireMember(ctx.db, groupId, user.id);
  const { balances } = await groupBalances(ctx.db, groupId);
  return { balances, payments: simplifyDebts(balances) };
}

// The demo account and its groups are kept apart from real users, because the demo is reset daily.
async function findJoinableGroup(ctx: Ctx, user: User, code: string) {
  const group = await groups.findByInviteCode(ctx.db, code);
  if (!group || group.createdByDemo !== user.isDemo) throw notFound('Invite');
  return group;
}

export async function previewInvite(ctx: Ctx, user: User, code: string) {
  const group = await findJoinableGroup(ctx, user, code);
  const members = await groups.listMembers(ctx.db, group.id);
  return {
    groupId: group.id,
    name: group.name,
    memberCount: members.filter((m) => m.status === 'active').length,
    alreadyMember: members.some((m) => m.userId === user.id && m.status === 'active'),
  };
}

export async function joinGroup(ctx: Ctx, user: User, code: string): Promise<string> {
  const group = await findJoinableGroup(ctx, user, code);
  await ctx.db.transaction(async (tx) => {
    const membership = await groups.findMembership(tx, group.id, user.id);
    if (membership?.status === 'active') return;
    if (membership) {
      const status = transitionMember(membership.status, 'rejoin');
      await groups.updateMember(tx, group.id, user.id, { role: 'member', status });
    } else {
      await groups.addMember(tx, group.id, user.id, 'member');
    }
    await activity.record(tx, {
      groupId: group.id,
      actorId: user.id,
      action: 'member_joined',
      summary: 'joined the group',
    });
  });
  return group.id;
}

export async function renameGroup(ctx: Ctx, user: User, groupId: string, name: string) {
  await ctx.db.transaction(async (tx) => {
    await requireAdmin(tx, groupId, user.id);
    await groups.rename(tx, groupId, name);
    await activity.record(tx, {
      groupId,
      actorId: user.id,
      action: 'group_renamed',
      summary: `renamed the group to "${name}"`,
    });
  });
}

// Amounts are never converted, so the currency is locked once anything has been recorded.
export async function changeCurrency(ctx: Ctx, user: User, groupId: string, currency: Currency) {
  await ctx.db.transaction(async (tx) => {
    await requireAdmin(tx, groupId, user.id);
    const group = await requireGroup(tx, groupId);
    if (group.currency === currency) return;
    if (await ledger.hasEntries(tx, groupId)) {
      throw conflict('The currency is locked once the group has an expense or payment.');
    }
    await groups.setCurrency(tx, groupId, currency);
    await activity.record(tx, {
      groupId,
      actorId: user.id,
      action: 'currency_changed',
      summary: `changed the currency to ${currency}`,
    });
  });
}

export async function regenerateInviteCode(ctx: Ctx, user: User, groupId: string) {
  await requireAdmin(ctx.db, groupId, user.id);
  const inviteCode = newInviteCode();
  await groups.setInviteCode(ctx.db, groupId, inviteCode);
  return inviteCode;
}

export async function deleteGroup(ctx: Ctx, user: User, groupId: string) {
  await ctx.db.transaction(async (tx) => {
    await requireAdmin(tx, groupId, user.id);
    await activity.publish(tx, groupId, 'group_deleted');
    await groups.remove(tx, groupId);
  });
}

async function requireActiveTarget(q: Queryable, groupId: string, userId: string) {
  const members = await groups.listMembers(q, groupId);
  const active = members.filter((m) => m.status === 'active');
  const target = active.find((m) => m.userId === userId);
  if (!target) throw notFound('Member');
  const isOnlyAdmin =
    target.role === 'admin' && active.filter((m) => m.role === 'admin').length === 1;
  return { target, activeCount: active.length, isOnlyAdmin };
}

export async function changeRole(
  ctx: Ctx,
  user: User,
  groupId: string,
  targetId: string,
  role: Role,
) {
  await ctx.db.transaction(async (tx) => {
    await requireAdmin(tx, groupId, user.id);
    const { target, isOnlyAdmin } = await requireActiveTarget(tx, groupId, targetId);
    if (target.role === role) return;
    if (isOnlyAdmin) throw conflict('Make someone else an admin first.');
    await groups.updateMember(tx, groupId, targetId, { role, status: 'active' });
    await activity.record(tx, {
      groupId,
      actorId: user.id,
      action: 'role_changed',
      summary: `made ${target.name} ${role === 'admin' ? 'an admin' : 'a member'}`,
    });
  });
}

// One function for both exits: a member leaving, or an admin removing someone else.
export async function removeMember(ctx: Ctx, user: User, groupId: string, targetId: string) {
  const isSelf = targetId === user.id;
  await ctx.db.transaction(async (tx) => {
    if (isSelf) await requireMember(tx, groupId, user.id);
    else await requireAdmin(tx, groupId, user.id);
    const { target, activeCount, isOnlyAdmin } = await requireActiveTarget(tx, groupId, targetId);
    if (isSelf && activeCount === 1) {
      throw conflict('You are the only member. Delete the group instead.');
    }
    if (isOnlyAdmin) throw conflict('Make someone else an admin first.');
    await requireSettled(tx, groupId, targetId, isSelf ? 'You' : target.name);

    const status = transitionMember(target.status, isSelf ? 'leave' : 'remove');
    await groups.updateMember(tx, groupId, targetId, { role: 'member', status });
    await activity.record(tx, {
      groupId,
      actorId: user.id,
      action: isSelf ? 'member_left' : 'member_removed',
      summary: isSelf ? 'left the group' : `removed ${target.name}`,
    });
  });
}
