import type { Ctx } from '../context.js';
import * as users from '../data/users.js';
import type { User } from '../data/users.js';
import { simplifyDebts } from '../domain/balances.js';
import { parseQrPh, withAmount } from '../domain/qrph.js';
import { badRequest, forbidden, notFound, setupRequired } from '../errors.js';
import { groupBalances, requireGroup, requireMember } from './groups.js';

const NOT_QR_PH =
  'That is not a QR Ph payment code. Use the QR from GCash, Maya or your bank’s InstaPay.';
const DEMO_FIXED = 'The demo account keeps its sample payment QRs.';
export const MAX_PAYMENT_QRS = 5;

function requireOwnAccount(user: User) {
  if (user.status !== 'active') throw setupRequired();
}

// Rows whose text no longer parses are left out rather than shown broken.
function describe(rows: users.PaymentQrRow[]) {
  return rows.flatMap((row) => {
    const parsed = parseQrPh(row.payload);
    return parsed ? [{ ...row, payeeName: parsed.payeeName }] : [];
  });
}

export async function listOwnQrs(ctx: Ctx, user: User) {
  requireOwnAccount(user);
  const methods = describe(await users.listPaymentQrs(ctx.db, user.id));
  return methods.map(({ id, label, payeeName }) => ({ id, label, payeeName }));
}

// Stores the text only; the image was decoded in the browser and never uploaded.
export async function addOwnQr(ctx: Ctx, user: User, input: { label: string; payload: string }) {
  requireOwnAccount(user);
  if (user.isDemo) throw forbidden(DEMO_FIXED);
  const parsed = parseQrPh(input.payload);
  if (!parsed) throw badRequest(NOT_QR_PH, { payload: NOT_QR_PH });
  const existing = await users.listPaymentQrs(ctx.db, user.id);
  if (existing.length >= MAX_PAYMENT_QRS) {
    throw badRequest(`You can save up to ${MAX_PAYMENT_QRS} payment QRs. Remove one first.`);
  }
  const label = input.label.trim();
  if (existing.some((qr) => qr.label.toLowerCase() === label.toLowerCase())) {
    const taken = `You already have a QR named ${label}. Pick another name.`;
    throw badRequest(taken, { label: taken });
  }
  const id = await users.addPaymentQr(ctx.db, user.id, { label, payload: input.payload.trim() });
  return { id, label, payeeName: parsed.payeeName };
}

export async function removeOwnQr(ctx: Ctx, user: User, id: string) {
  requireOwnAccount(user);
  if (user.isDemo) throw forbidden(DEMO_FIXED);
  const owned = await users.listPaymentQrs(ctx.db, user.id);
  if (!owned.some((qr) => qr.id === id)) throw notFound('Payment QR');
  await users.removePaymentQr(ctx.db, user.id, id);
}

// Every QR the payee saved, each with the amount from the group's current settle-up plan.
export async function getPaymentQr(
  ctx: Ctx,
  user: User,
  groupId: string,
  fromUser: string,
  toUser: string,
) {
  await requireMember(ctx.db, groupId, user.id);
  // QR Ph (InstaPay) carries pesos only, so other currencies have no payment QR.
  if ((await requireGroup(ctx.db, groupId)).currency !== 'PHP') throw notFound('Payment QR');
  const { balances } = await groupBalances(ctx.db, groupId);
  const payment = simplifyDebts(balances).find(
    (p) => p.fromUser === fromUser && p.toUser === toUser,
  );
  if (!payment) throw notFound('Payment');
  const methods = describe(await users.listPaymentQrs(ctx.db, toUser));
  if (methods.length === 0) throw notFound('Payment QR');
  return {
    amountCentavos: payment.amountCentavos,
    methods: methods.map((m) => ({
      id: m.id,
      label: m.label,
      payeeName: m.payeeName,
      payload: withAmount(m.payload, payment.amountCentavos),
    })),
  };
}
