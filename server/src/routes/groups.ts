import { Router } from 'express';
import type { Ctx } from '../context.js';
import { currentUser } from '../middleware/session.js';
import * as groups from '../services/groups.js';
import * as ledger from '../services/ledger.js';
import * as schemas from './schemas.js';

// Handlers only parse the request, call one service function and shape the response.
export function groupRoutes(ctx: Ctx): Router {
  const router = Router();
  const param = (value: unknown) => schemas.id.parse(value);

  router.get('/groups', async (_req, res) => {
    res.json({ groups: await groups.listGroups(ctx, currentUser(res)) });
  });

  router.post('/groups', async (req, res) => {
    const { name } = schemas.groupName.parse(req.body);
    res.status(201).json({ id: await groups.createGroup(ctx, currentUser(res), name) });
  });

  router.get('/invites/:code', async (req, res) => {
    const code = schemas.inviteCode.parse(req.params.code);
    res.json(await groups.previewInvite(ctx, currentUser(res), code));
  });

  router.post('/invites/:code/join', async (req, res) => {
    const code = schemas.inviteCode.parse(req.params.code);
    res.json({ groupId: await groups.joinGroup(ctx, currentUser(res), code) });
  });

  router.get('/groups/:id', async (req, res) => {
    res.json(await groups.getGroup(ctx, currentUser(res), param(req.params.id)));
  });

  router.patch('/groups/:id', async (req, res) => {
    const { name } = schemas.groupName.parse(req.body);
    await groups.renameGroup(ctx, currentUser(res), param(req.params.id), name);
    res.status(204).end();
  });

  router.delete('/groups/:id', async (req, res) => {
    await groups.deleteGroup(ctx, currentUser(res), param(req.params.id));
    res.status(204).end();
  });

  router.post('/groups/:id/invite-code', async (req, res) => {
    const groupId = param(req.params.id);
    res.json({ inviteCode: await groups.regenerateInviteCode(ctx, currentUser(res), groupId) });
  });

  router.patch('/groups/:id/members/:userId', async (req, res) => {
    const { role } = schemas.role.parse(req.body);
    const [groupId, userId] = [param(req.params.id), param(req.params.userId)];
    await groups.changeRole(ctx, currentUser(res), groupId, userId, role);
    res.status(204).end();
  });

  router.delete('/groups/:id/members/:userId', async (req, res) => {
    const [groupId, userId] = [param(req.params.id), param(req.params.userId)];
    await groups.removeMember(ctx, currentUser(res), groupId, userId);
    res.status(204).end();
  });

  router.get('/groups/:id/balances', async (req, res) => {
    res.json(await groups.getBalances(ctx, currentUser(res), param(req.params.id)));
  });

  router.get('/groups/:id/summary', async (req, res) => {
    res.json(await ledger.getSummary(ctx, currentUser(res), param(req.params.id)));
  });

  router.get('/groups/:id/activity', async (req, res) => {
    const page = schemas.page.parse(req.query);
    res.json(await ledger.listActivity(ctx, currentUser(res), param(req.params.id), page));
  });

  router.get('/groups/:id/expenses', async (req, res) => {
    const page = schemas.page.parse(req.query);
    res.json(await ledger.listExpenses(ctx, currentUser(res), param(req.params.id), page));
  });

  router.post('/groups/:id/expenses', async (req, res) => {
    const payload = schemas.expense.parse(req.body);
    const id = await ledger.createExpense(ctx, currentUser(res), param(req.params.id), payload);
    res.status(201).json({ id });
  });

  router.put('/groups/:id/expenses/:expenseId', async (req, res) => {
    const payload = schemas.expense.parse(req.body);
    const [groupId, expenseId] = [param(req.params.id), param(req.params.expenseId)];
    await ledger.updateExpense(ctx, currentUser(res), groupId, expenseId, payload);
    res.status(204).end();
  });

  router.delete('/groups/:id/expenses/:expenseId', async (req, res) => {
    const [groupId, expenseId] = [param(req.params.id), param(req.params.expenseId)];
    await ledger.deleteExpense(ctx, currentUser(res), groupId, expenseId);
    res.status(204).end();
  });

  router.get('/groups/:id/settlements', async (req, res) => {
    const page = schemas.page.parse(req.query);
    res.json(await ledger.listSettlements(ctx, currentUser(res), param(req.params.id), page));
  });

  router.post('/groups/:id/settlements', async (req, res) => {
    const input = schemas.settlement.parse(req.body);
    const id = await ledger.createSettlement(ctx, currentUser(res), param(req.params.id), input);
    res.status(201).json({ id });
  });

  router.delete('/groups/:id/settlements/:settlementId', async (req, res) => {
    const [groupId, settlementId] = [param(req.params.id), param(req.params.settlementId)];
    await ledger.deleteSettlement(ctx, currentUser(res), groupId, settlementId);
    res.status(204).end();
  });

  return router;
}
