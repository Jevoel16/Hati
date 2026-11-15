import type { Ctx } from '../context.js';
import * as users from '../data/users.js';
import type { User } from '../data/users.js';
import { simplifyDebts } from '../domain/balances.js';
import { parseQrPh, withAmount } from '../domain/qrph.js';
import { badRequest, forbidden, notFound, setupRequired } from '../errors.js';
import { groupBalances, requireMember } from './groups.js';

const NOT_QR_PH =
  'That is not a QR Ph payment code. Use the QR from GCash, Maya or your bank’s InstaPay.';

function requireOwnAccount(user: User) {
  if (user.status !== 'active') throw setupRequired();
}

export async function getOwnQr(ctx: Ctx, user: User) {
  requireOwnAccount(user);
  const payload = await users.findPaymentQr(ctx.db, user.id);
  return payload ? parseQrPh(payload) : null;
}

// Stores the text only; the image was decoded in the browser and never uploaded.
export async function saveOwnQr(ctx: Ctx, user: User, payload: string) {
  requireOwnAccount(user);
  if (user.isDemo) throw forbidden('The demo account keeps its sample payment QR.');
  const parsed = parseQrPh(payload);
  if (!parsed) throw badRequest(NOT_QR_PH, { payload: NOT_QR_PH });
  await users.setPaymentQr(ctx.db, user.id, payload.trim());
  return parsed;
}

export async function removeOwnQr(ctx: Ctx, user: User) {
  requireOwnAccount(user);
  if (user.isDemo) throw forbidden('The demo account keeps its sample payment QR.');
  await users.setPaymentQr(ctx.db, user.id, null);
}

// The amount comes from the group's current settle-up plan, never from the request.
export async function getPaymentQr(
  ctx: Ctx,
  user: User,
  groupId: string,
  fromUser: string,
  toUser: string,
) {
  await requireMember(ctx.db, groupId, user.id);
  const { balances } = await groupBalances(ctx.db, groupId);
  const payment = simplifyDebts(balances).find(
    (p) => p.fromUser === fromUser && p.toUser === toUser,
  );
  if (!payment) throw notFound('Payment');
  const payload = await users.findPaymentQr(ctx.db, toUser);
  const parsed = payload && parseQrPh(payload);
  if (!payload || !parsed) throw notFound('Payment QR');
  return {
    payload: withAmount(payload, payment.amountCentavos),
    amountCentavos: payment.amountCentavos,
    payeeName: parsed.payeeName,
  };
}
