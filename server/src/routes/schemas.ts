import { z } from 'zod';
import { CATEGORIES, MAX_AMOUNT_CENTAVOS } from '../domain/money.js';
import { MAX_QR_LENGTH } from '../domain/qrph.js';
import { PASSWORD_MIN_LENGTH } from '../services/auth.js';
import { INVITE_CODE_PATTERN } from '../services/groups.js';

const MAX_PEOPLE = 50;

export const id = z.uuid();
const date = z.iso.date();
const amount = z.number().int().min(1).max(MAX_AMOUNT_CENTAVOS);

export const inviteCode = z
  .string()
  .transform((code) => code.toUpperCase())
  .pipe(z.string().regex(INVITE_CODE_PATTERN));

export const signIn = z.object({
  email: z.string().trim().max(254),
  password: z.string().max(200),
});

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const usernameRule = 'Use 3 to 20 lowercase letters, numbers or underscores.';
const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`);

// The password is required by the service only when the account has none yet.
export const setup = z.object({
  username: z.string(usernameRule).trim().toLowerCase().regex(USERNAME_PATTERN, usernameRule),
  password: newPassword.optional(),
});

export const password = z.object({
  password: newPassword,
  currentPassword: z.string().max(200).optional(),
});

export const groupName = z.object({ name: z.string().trim().min(1).max(60) });
export const role = z.object({ role: z.enum(['admin', 'member']) });

export const expense = z.object({
  description: z.string().trim().min(1).max(120),
  amountCentavos: amount,
  category: z.enum(CATEGORIES),
  spentOn: date,
  paidBy: id,
  split: z.discriminatedUnion('type', [
    z.object({ type: z.literal('equal'), participants: z.array(id).min(1).max(MAX_PEOPLE) }),
    z.object({
      type: z.literal('exact'),
      shares: z
        .array(z.object({ userId: id, amountCentavos: z.number().int().min(0) }))
        .min(1)
        .max(MAX_PEOPLE),
    }),
    z.object({
      type: z.literal('percent'),
      shares: z
        .array(z.object({ userId: id, percent: z.number().min(0).max(100) }))
        .min(1)
        .max(MAX_PEOPLE),
    }),
  ]),
});

export const settlement = z.object({
  fromUser: id,
  toUser: id,
  amountCentavos: amount,
  settledOn: date,
});

export const paymentQr = z.object({
  label: z.string().trim().min(1).max(40),
  payload: z.string().trim().min(1).max(MAX_QR_LENGTH),
});
export const paymentQrQuery = z.object({ from: id, to: id });

// Every list endpoint is paginated, with a hard ceiling on the page size.
export const page = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
