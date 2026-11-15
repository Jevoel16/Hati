import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Ctx } from '../context.js';
import * as groups from '../data/groups.js';
import * as users from '../data/users.js';
import type { User } from '../data/users.js';
import { createGroup, getGroup, joinGroup } from './groups.js';
import { createExpense, createSettlement } from './ledger.js';

// Public on purpose: shown on the sign-in page so a reviewer gets in within seconds.
export const DEMO_ACCOUNT = { email: 'demo@hati.example', password: 'hati-demo-2026' };

const HOUSEMATES = [
  { name: 'Bea Santos', email: 'bea@hati.example' },
  { name: 'Carlo Reyes', email: 'carlo@hati.example' },
  { name: 'Dana Lim', email: 'dana@hati.example' },
];

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

async function ensureDemoUser(ctx: Ctx, name: string, email: string, password: string) {
  let user = await users.findByEmail(ctx.db, email);
  if (!user) {
    const id = await users.create(ctx.db, { name, email, isDemo: true });
    await users.completeSetup(ctx.db, id, {
      username: email.split('@')[0]!,
      passwordHash: await bcrypt.hash(password, ctx.hashCost),
      status: 'active',
    });
    user = await users.findById(ctx.db, id);
  }
  return user as User;
}

// Wipes every group the demo account created and rebuilds the sample boarding house.
export async function resetDemo(ctx: Ctx): Promise<void> {
  const demo = await ensureDemoUser(ctx, 'Alex Cruz', DEMO_ACCOUNT.email, DEMO_ACCOUNT.password);
  const mates: User[] = [];
  for (const mate of HOUSEMATES) {
    // Housemates exist only as names in the demo group; nobody knows their random password.
    const password = randomBytes(24).toString('base64url');
    mates.push(await ensureDemoUser(ctx, mate.name, mate.email, password));
  }
  const [bea, carlo, dana] = mates as [User, User, User];

  await groups.removeCreatedBy(ctx.db, demo.id);
  const groupId = await createGroup(ctx, demo, 'Unit 3B Boarding House');
  const { inviteCode } = await getGroup(ctx, demo, groupId);
  for (const mate of mates) await joinGroup(ctx, mate, inviteCode);

  const everyone = [demo.id, bea.id, carlo.id, dana.id];
  const equal = { type: 'equal' as const, participants: everyone };
  await createExpense(ctx, demo, groupId, {
    description: 'November rent',
    amountCentavos: 1_400_000,
    category: 'rent',
    spentOn: daysAgo(12),
    paidBy: demo.id,
    split: equal,
  });
  await createExpense(ctx, bea, groupId, {
    description: 'Electricity bill',
    amountCentavos: 285_050,
    category: 'utilities',
    spentOn: daysAgo(9),
    paidBy: bea.id,
    split: equal,
  });
  await createExpense(ctx, carlo, groupId, {
    description: 'Weekly groceries',
    amountCentavos: 187_525,
    category: 'groceries',
    spentOn: daysAgo(6),
    paidBy: carlo.id,
    split: {
      type: 'percent',
      shares: [
        { userId: demo.id, percent: 30 },
        { userId: bea.id, percent: 30 },
        { userId: carlo.id, percent: 25 },
        { userId: dana.id, percent: 15 },
      ],
    },
  });
  await createExpense(ctx, dana, groupId, {
    description: 'Wi-Fi plan',
    amountCentavos: 159_900,
    category: 'utilities',
    spentOn: daysAgo(4),
    paidBy: dana.id,
    split: equal,
  });
  await createExpense(ctx, demo, groupId, {
    description: 'Pizza night',
    amountCentavos: 89_000,
    category: 'food',
    spentOn: daysAgo(2),
    paidBy: demo.id,
    split: {
      type: 'exact',
      shares: [
        { userId: demo.id, amountCentavos: 29_000 },
        { userId: bea.id, amountCentavos: 30_000 },
        { userId: carlo.id, amountCentavos: 30_000 },
      ],
    },
  });
  await createExpense(ctx, bea, groupId, {
    description: 'Cleaning supplies',
    amountCentavos: 42_075,
    category: 'supplies',
    spentOn: daysAgo(40),
    paidBy: bea.id,
    split: equal,
  });
  await createSettlement(ctx, carlo, groupId, {
    fromUser: carlo.id,
    toUser: demo.id,
    amountCentavos: 200_000,
    settledOn: daysAgo(1),
  });
}
