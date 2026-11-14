// The two server-side state machines. Tables and events are listed in docs/state-machines.md.

export const ACCOUNT_STATUS = Object.freeze({
  passwordPending: 'password_pending',
  active: 'active',
} as const);
export type AccountStatus = (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS];
export type AccountEvent = 'password_set' | 'password_changed';

const accountTransitions: Record<AccountStatus, Partial<Record<AccountEvent, AccountStatus>>> = {
  password_pending: { password_set: 'active' },
  active: { password_changed: 'active' },
};

export const MEMBER_STATUS = Object.freeze({ active: 'active', left: 'left' } as const);
export type MemberStatus = (typeof MEMBER_STATUS)[keyof typeof MEMBER_STATUS];
export type MemberEvent = 'leave' | 'remove' | 'rejoin';

const memberTransitions: Record<MemberStatus, Partial<Record<MemberEvent, MemberStatus>>> = {
  active: { leave: 'left', remove: 'left' },
  left: { rejoin: 'active' },
};

export class TransitionError extends Error {}

function next<S extends string, E extends string>(
  table: Record<S, Partial<Record<E, S>>>,
  state: S,
  event: E,
): S {
  const target = table[state][event];
  if (!target) throw new TransitionError(`Cannot apply "${event}" in state "${state}".`);
  return target;
}

export const transitionAccount = (state: AccountStatus, event: AccountEvent) =>
  next(accountTransitions, state, event);
export const transitionMember = (state: MemberStatus, event: MemberEvent) =>
  next(memberTransitions, state, event);
