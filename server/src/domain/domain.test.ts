import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeBalances, simplifyDebts, type Balance } from './balances.js';
import { TransitionError, transitionAccount, transitionMember } from './machines.js';
import { SplitError, splitByPercent, splitEqually, splitExact } from './split.js';

const total = (shares: { shareCentavos: number }[]) =>
  shares.reduce((sum, s) => sum + s.shareCentavos, 0);

describe('splitEqually', () => {
  it('splits evenly when the amount divides', () => {
    assert.deepEqual(splitEqually(900, ['a', 'b', 'c']), [
      { userId: 'a', shareCentavos: 300 },
      { userId: 'b', shareCentavos: 300 },
      { userId: 'c', shareCentavos: 300 },
    ]);
  });

  it('hands leftover centavos to the first people so the total is exact', () => {
    const shares = splitEqually(1000, ['a', 'b', 'c']);
    assert.deepEqual(
      shares.map((s) => s.shareCentavos),
      [334, 333, 333],
    );
    assert.equal(total(shares), 1000);
  });

  it('rejects an empty list, duplicates and bad amounts', () => {
    assert.throws(() => splitEqually(100, []), SplitError);
    assert.throws(() => splitEqually(100, ['a', 'a']), SplitError);
    assert.throws(() => splitEqually(0, ['a']), SplitError);
    assert.throws(() => splitEqually(10.5, ['a']), SplitError);
  });
});

describe('splitExact', () => {
  it('accepts shares that add up to the amount', () => {
    const shares = splitExact(1000, [
      { userId: 'a', amountCentavos: 700 },
      { userId: 'b', amountCentavos: 300 },
    ]);
    assert.equal(total(shares), 1000);
  });

  it('rejects shares that do not add up, or are negative', () => {
    assert.throws(() => splitExact(1000, [{ userId: 'a', amountCentavos: 999 }]), SplitError);
    assert.throws(
      () =>
        splitExact(1000, [
          { userId: 'a', amountCentavos: 1100 },
          { userId: 'b', amountCentavos: -100 },
        ]),
      SplitError,
    );
  });
});

describe('splitByPercent', () => {
  it('splits by percentage', () => {
    const shares = splitByPercent(20_000, [
      { userId: 'a', basisPoints: 5000 },
      { userId: 'b', basisPoints: 3000 },
      { userId: 'c', basisPoints: 2000 },
    ]);
    assert.deepEqual(
      shares.map((s) => s.shareCentavos),
      [10_000, 6000, 4000],
    );
  });

  it('gives leftover centavos to the largest remainders', () => {
    const shares = splitByPercent(100, [
      { userId: 'a', basisPoints: 3333 },
      { userId: 'b', basisPoints: 3333 },
      { userId: 'c', basisPoints: 3334 },
    ]);
    assert.deepEqual(
      shares.map((s) => s.shareCentavos),
      [33, 33, 34],
    );
    assert.equal(total(shares), 100);
  });

  it('always sums exactly for awkward amounts', () => {
    for (const amount of [1, 7, 99, 101, 12_345, 99_999_999]) {
      const shares = splitByPercent(amount, [
        { userId: 'a', basisPoints: 1234 },
        { userId: 'b', basisPoints: 4321 },
        { userId: 'c', basisPoints: 4445 },
      ]);
      assert.equal(total(shares), amount);
    }
  });

  it('rejects percentages that do not total 100', () => {
    assert.throws(() => splitByPercent(100, [{ userId: 'a', basisPoints: 9999 }]), SplitError);
  });
});

describe('computeBalances', () => {
  it('nets payments against shares and includes members with no activity', () => {
    const balances = computeBalances(
      ['a', 'b', 'c'],
      [
        { userId: 'a', deltaCentavos: 900 },
        { userId: 'a', deltaCentavos: -450 },
        { userId: 'b', deltaCentavos: -450 },
      ],
    );
    assert.deepEqual(balances, [
      { userId: 'a', netCentavos: 450 },
      { userId: 'b', netCentavos: -450 },
      { userId: 'c', netCentavos: 0 },
    ]);
  });

  it('throws when the deltas do not sum to zero', () => {
    assert.throws(() => computeBalances(['a'], [{ userId: 'a', deltaCentavos: 1 }]));
  });
});

describe('simplifyDebts', () => {
  const settle = (balances: Balance[]) => {
    const net = new Map(balances.map((b) => [b.userId, b.netCentavos]));
    for (const p of simplifyDebts(balances)) {
      net.set(p.fromUser, net.get(p.fromUser)! + p.amountCentavos);
      net.set(p.toUser, net.get(p.toUser)! - p.amountCentavos);
    }
    return [...net.values()];
  };

  it('returns nothing when everyone is settled', () => {
    assert.deepEqual(simplifyDebts([{ userId: 'a', netCentavos: 0 }]), []);
  });

  it('collapses a chain of debts into direct payments', () => {
    const payments = simplifyDebts([
      { userId: 'a', netCentavos: 1000 },
      { userId: 'b', netCentavos: 0 },
      { userId: 'c', netCentavos: -1000 },
    ]);
    assert.deepEqual(payments, [{ fromUser: 'c', toUser: 'a', amountCentavos: 1000 }]);
  });

  it('settles everyone in at most n-1 payments', () => {
    const balances = [
      { userId: 'a', netCentavos: 5000 },
      { userId: 'b', netCentavos: -1200 },
      { userId: 'c', netCentavos: -2300 },
      { userId: 'd', netCentavos: 700 },
      { userId: 'e', netCentavos: -2200 },
    ];
    assert.ok(simplifyDebts(balances).length <= balances.length - 1);
    assert.ok(settle(balances).every((net) => net === 0));
  });
});

describe('state machines', () => {
  it('account: setting a password activates a pending account', () => {
    assert.equal(transitionAccount('password_pending', 'password_set'), 'active');
    assert.equal(transitionAccount('active', 'password_changed'), 'active');
  });

  it('account: rejects events that do not belong to the state', () => {
    assert.throws(() => transitionAccount('active', 'password_set'), TransitionError);
    assert.throws(() => transitionAccount('password_pending', 'password_changed'), TransitionError);
  });

  it('member: leave, remove and rejoin', () => {
    assert.equal(transitionMember('active', 'leave'), 'left');
    assert.equal(transitionMember('active', 'remove'), 'left');
    assert.equal(transitionMember('left', 'rejoin'), 'active');
  });

  it('member: rejects leaving twice or rejoining while active', () => {
    assert.throws(() => transitionMember('left', 'leave'), TransitionError);
    assert.throws(() => transitionMember('active', 'rejoin'), TransitionError);
  });
});
