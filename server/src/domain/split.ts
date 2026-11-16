export type Share = { userId: string; shareCentavos: number };

export class SplitError extends Error {}

function assertValidAmount(amountCentavos: number): void {
  if (!Number.isInteger(amountCentavos) || amountCentavos <= 0) {
    throw new SplitError('The amount must be a whole number above zero.');
  }
}

function assertDistinctUsers(userIds: string[]): void {
  if (userIds.length === 0) throw new SplitError('Pick at least one person to split with.');
  if (new Set(userIds).size !== userIds.length) {
    throw new SplitError('Each person can appear only once in a split.');
  }
}

// Leftover units (centavos, yen) go to the first people, one each, so shares always sum exactly.
export function splitEqually(amountCentavos: number, userIds: string[]): Share[] {
  assertValidAmount(amountCentavos);
  assertDistinctUsers(userIds);
  const base = Math.floor(amountCentavos / userIds.length);
  const leftover = amountCentavos - base * userIds.length;
  return userIds.map((userId, index) => ({
    userId,
    shareCentavos: base + (index < leftover ? 1 : 0),
  }));
}

export function splitExact(
  amountCentavos: number,
  parts: { userId: string; amountCentavos: number }[],
): Share[] {
  assertValidAmount(amountCentavos);
  assertDistinctUsers(parts.map((p) => p.userId));
  if (parts.some((p) => !Number.isInteger(p.amountCentavos) || p.amountCentavos < 0)) {
    throw new SplitError('Each share must be a whole number, zero or more.');
  }
  const total = parts.reduce((sum, p) => sum + p.amountCentavos, 0);
  if (total !== amountCentavos) {
    throw new SplitError('The shares must add up to the expense amount.');
  }
  return parts.map((p) => ({ userId: p.userId, shareCentavos: p.amountCentavos }));
}

// Percentages arrive as basis points (25.5% = 2550) so the maths stays in integers.
export function splitByPercent(
  amountCentavos: number,
  parts: { userId: string; basisPoints: number }[],
): Share[] {
  assertValidAmount(amountCentavos);
  assertDistinctUsers(parts.map((p) => p.userId));
  if (parts.some((p) => !Number.isInteger(p.basisPoints) || p.basisPoints < 0)) {
    throw new SplitError('Each percentage must be zero or more, with at most two decimals.');
  }
  if (parts.reduce((sum, p) => sum + p.basisPoints, 0) !== 10_000) {
    throw new SplitError('The percentages must add up to 100.');
  }
  const rows = parts.map((p, index) => {
    const raw = amountCentavos * p.basisPoints;
    return { index, userId: p.userId, share: Math.floor(raw / 10_000), remainder: raw % 10_000 };
  });
  let leftover = amountCentavos - rows.reduce((sum, r) => sum + r.share, 0);
  // Largest remainder first; ties keep list order.
  const byRemainder = [...rows].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const row of byRemainder) {
    if (leftover === 0) break;
    row.share += 1;
    leftover -= 1;
  }
  return rows.map((r) => ({ userId: r.userId, shareCentavos: r.share }));
}
