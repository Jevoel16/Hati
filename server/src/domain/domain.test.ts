import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeBalances, simplifyDebts, type Balance } from './balances.js';
import { BOM, csvCell, toCsv } from './csv.js';
import { TransitionError, transitionAccount, transitionMember } from './machines.js';
import { formatMoney, minorDigits, toMajorString } from './money.js';
import { amountText, crc16, encode, parseQrPh, tlv, withAmount, type Field } from './qrph.js';
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

// Yen and won have no smaller unit, so 1 means ¥1 and the splitter must never need a fraction.
describe('splitting a zero-decimal currency (JPY)', () => {
  it('splits ¥1,000 three ways into whole yen', () => {
    const shares = splitEqually(1000, ['a', 'b', 'c']);
    assert.deepEqual(
      shares.map((s) => s.shareCentavos),
      [334, 333, 333],
    );
    assert.equal(formatMoney(334, 'JPY'), '¥334');
  });

  it('splits ¥10 by percentage with the leftover yen on the largest remainder', () => {
    const shares = splitByPercent(10, [
      { userId: 'a', basisPoints: 3333 },
      { userId: 'b', basisPoints: 3333 },
      { userId: 'c', basisPoints: 3334 },
    ]);
    assert.deepEqual(
      shares.map((s) => s.shareCentavos),
      [3, 3, 4],
    );
  });

  it('accepts exact shares in whole yen', () => {
    assert.equal(
      total(
        splitExact(1500, [
          { userId: 'a', amountCentavos: 1000 },
          { userId: 'b', amountCentavos: 500 },
        ]),
      ),
      1500,
    );
  });
});

describe('money formatting', () => {
  it('reads the number of decimals from the currency', () => {
    assert.equal(minorDigits('PHP'), 2);
    assert.equal(minorDigits('USD'), 2);
    assert.equal(minorDigits('JPY'), 0);
    assert.equal(minorDigits('KRW'), 0);
  });

  it('formats the smallest unit in the right currency', () => {
    assert.equal(formatMoney(125_050, 'PHP'), '₱1,250.50');
    assert.equal(formatMoney(1250, 'JPY'), '¥1,250');
  });

  it('writes plain digits for spreadsheets', () => {
    assert.equal(toMajorString(125_050, 'PHP'), '1250.50');
    assert.equal(toMajorString(7, 'PHP'), '0.07');
    assert.equal(toMajorString(1250, 'JPY'), '1250');
    assert.equal(toMajorString(-500, 'USD'), '-5.00');
  });
});

describe('CSV', () => {
  it('leaves plain cells alone', () => {
    assert.equal(csvCell('Groceries'), 'Groceries');
    assert.equal(csvCell('1250.50'), '1250.50');
  });

  it('quotes commas, quotes and line breaks', () => {
    assert.equal(csvCell('Rice, eggs'), '"Rice, eggs"');
    assert.equal(csvCell('The "good" pizza'), '"The ""good"" pizza"');
    assert.equal(csvCell('two\nlines'), '"two\nlines"');
  });

  it('stops spreadsheets from running a cell as a formula', () => {
    for (const start of ['=', '+', '-', '@', '\t', '\r']) {
      assert.ok(csvCell(`${start}1+1`).replace(/^"/, '').startsWith(`'${start}`), start);
    }
    assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  });

  it('writes CRLF rows after a byte-order mark', () => {
    assert.equal(
      toCsv([
        ['a', 'b'],
        ['c', 'd'],
      ]),
      `${BOM}a,b\r\nc,d\r\n`,
    );
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
    assert.equal(transitionAccount('password_pending', 'setup_completed'), 'active');
    assert.equal(transitionAccount('username_pending', 'username_set'), 'active');
    assert.equal(transitionAccount('active', 'password_changed'), 'active');
  });

  it('account: rejects events that do not belong to the state', () => {
    assert.throws(() => transitionAccount('active', 'setup_completed'), TransitionError);
    assert.throws(() => transitionAccount('active', 'username_set'), TransitionError);
    assert.throws(() => transitionAccount('username_pending', 'setup_completed'), TransitionError);
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

describe('QR Ph', () => {
  const fields = (overrides: Record<string, string | null> = {}): Field[] =>
    [
      { id: '00', value: '01' },
      { id: '01', value: '11' },
      {
        id: '27',
        value: [
          { id: '00', value: 'com.p2pqrpay' },
          { id: '04', value: '0917' },
        ]
          .map(tlv)
          .join(''),
      },
      { id: '52', value: '6016' },
      { id: '53', value: '608' },
      { id: '58', value: 'PH' },
      { id: '59', value: 'BEA SANTOS' },
      { id: '60', value: 'ILIGAN' },
    ]
      .map((f) => (f.id in overrides ? { id: f.id, value: overrides[f.id] } : f))
      .filter((f): f is Field => f.value !== null);
  const valid = encode(fields());

  it('computes the CRC-16/CCITT-FALSE check value', () => {
    assert.equal(crc16('123456789'), '29B1');
  });

  it('reads the payee from a valid code, with spaces around it', () => {
    assert.deepEqual(
      parseQrPh(`  ${valid}
`),
      { payeeName: 'BEA SANTOS' },
    );
  });

  it('rejects a broken CRC, other currencies or countries, and garbage', () => {
    const badCrc = valid.slice(0, -1) + (valid.endsWith('0') ? '1' : '0');
    for (const bad of [
      badCrc,
      encode(fields({ '53': '840' })),
      encode(fields({ '58': 'US' })),
      encode(fields({ '27': null })),
      encode(fields({ '59': null })),
      encode(fields({ '00': '02' })),
      'https://hati.test/join/ABCD2345',
      '',
      'x'.repeat(600),
    ]) {
      assert.equal(parseQrPh(bad), null, bad);
    }
  });

  it('formats centavos for the amount field without floats', () => {
    assert.equal(amountText(1), '0.01');
    assert.equal(amountText(230_889), '2308.89');
    assert.equal(amountText(100_000_000), '1000000.00');
  });

  it('adds the exact amount as a single-use code that still validates', () => {
    const paid = withAmount(valid, 230_889);
    assert.deepEqual(parseQrPh(paid), { payeeName: 'BEA SANTOS' });
    assert.ok(paid.startsWith('000201010212'));
    assert.ok(paid.includes('54072308.89'));
    // The amount sits before the country field, in id order.
    assert.ok(
      paid.indexOf('5303608') < paid.indexOf('5407') &&
        paid.indexOf('5407') < paid.indexOf('5802PH'),
    );
    assert.match(paid, /6304[0-9A-F]{4}$/);
  });

  it('replaces an amount and type already in the code', () => {
    const twice = withAmount(withAmount(valid, 500), 12_345);
    assert.equal(twice.match(/5406/g)?.length, 1);
    assert.ok(twice.includes('5406123.45'));
    assert.equal(twice.match(/010212/g)?.length, 1);
  });

  it('refuses an amount that is not whole positive centavos', () => {
    assert.throws(() => withAmount(valid, 0));
    assert.throws(() => withAmount(valid, 1.5));
  });
});
