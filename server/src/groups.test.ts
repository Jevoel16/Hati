import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { WebSocket } from 'ws';
import { APP_URL, skip, startTestApp, type Client } from './testing.js';

type Person = { client: Client; id: string };

describe('groups, expenses and live updates', { skip }, () => {
  let app: Awaited<ReturnType<typeof startTestApp>>;
  let ana: Person, ben: Person, cara: Person, dan: Person;
  let groupId: string;
  let inviteCode: string;
  let firstExpenseId: string;

  const group = (path = '') => `/api/groups/${groupId}${path}`;
  const netOf = async (person: Person) => {
    const { balances } = (await ana.client.get(group('/balances'))).body;
    return balances.find((b: { userId: string }) => b.userId === person.id).netCentavos;
  };
  const expense = (overrides: object = {}) => ({
    description: 'Lunch',
    amountCentavos: 1000,
    category: 'food',
    spentOn: '2026-11-01',
    paidBy: ana.id,
    split: { type: 'equal', participants: [ana.id, ben.id, cara.id] },
    ...overrides,
  });

  before(async () => {
    app = await startTestApp();
    [ana, ben, cara, dan] = (await Promise.all(
      ['ana', 'ben', 'cara', 'dan'].map((name) => app.signUp(`${name}@example.com`)),
    )) as [Person, Person, Person, Person];
  });
  after(() => app.stop());

  it('creates a group with its creator as admin', async () => {
    const created = await ana.client.post('/api/groups', { name: 'Unit 3B' });
    assert.equal(created.status, 201);
    groupId = created.body.id;

    const detail = (await ana.client.get(group())).body;
    inviteCode = detail.inviteCode;
    assert.equal(detail.role, 'admin');
    assert.equal(detail.members.length, 1);

    const [listed] = (await ana.client.get('/api/groups')).body.groups;
    assert.deepEqual(
      { name: listed.name, memberCount: listed.memberCount, netCentavos: listed.netCentavos },
      { name: 'Unit 3B', memberCount: 1, netCentavos: 0 },
    );
  });

  it('lets people join with the invite code, in any letter case', async () => {
    const preview = await ben.client.get(`/api/invites/${inviteCode.toLowerCase()}`);
    assert.equal(preview.body.name, 'Unit 3B');
    assert.equal((await ben.client.post(`/api/invites/${inviteCode}/join`)).status, 200);
    assert.equal((await cara.client.post(`/api/invites/${inviteCode}/join`)).status, 200);
    assert.equal((await ana.client.get(group())).body.members.length, 3);
  });

  it('hides the group from people who are not members', async () => {
    assert.equal((await dan.client.get(group())).status, 404);
    assert.equal((await dan.client.get(group('/balances'))).status, 404);
    assert.equal((await dan.client.get(group('/expenses'))).status, 404);
    assert.equal((await dan.client.post(group('/expenses'), expense())).status, 404);
    assert.equal((await app.client().get(group())).status, 401);
  });

  it('keeps admin actions for admins', async () => {
    const rename = await ben.client.request('PATCH', group(), { name: 'Hacked' });
    const promote = await ben.client.request('PATCH', group(`/members/${ben.id}`), {
      role: 'admin',
    });
    const remove = await ben.client.request('DELETE', group(`/members/${cara.id}`));
    const destroy = await ben.client.request('DELETE', group());
    assert.deepEqual(
      [rename.status, promote.status, remove.status, destroy.status],
      [403, 403, 403, 403],
    );
  });

  it('splits an expense equally and updates everyone’s balance', async () => {
    const created = await ana.client.post(group('/expenses'), expense());
    assert.equal(created.status, 201);
    firstExpenseId = created.body.id;

    assert.deepEqual([await netOf(ana), await netOf(ben), await netOf(cara)], [666, -333, -333]);
    const { payments } = (await ana.client.get(group('/balances'))).body;
    assert.equal(payments.length, 2);
    assert.ok(payments.every((p: { toUser: string }) => p.toUser === ana.id));
  });

  it('rejects expenses that break the rules', async () => {
    const badSum = await ana.client.post(
      group('/expenses'),
      expense({ split: { type: 'exact', shares: [{ userId: ana.id, amountCentavos: 999 }] } }),
    );
    assert.equal(badSum.status, 400);
    assert.ok(badSum.body.error.fields.split);

    const outsider = await ana.client.post(
      group('/expenses'),
      expense({ split: { type: 'equal', participants: [ana.id, dan.id] } }),
    );
    assert.equal(outsider.status, 400);

    const zero = await ana.client.post(group('/expenses'), expense({ amountCentavos: 0 }));
    assert.equal(zero.status, 400);
    assert.equal(await netOf(ana), 666);
  });

  it('splits by percentage', async () => {
    const created = await ben.client.post(
      group('/expenses'),
      expense({
        description: 'Groceries',
        amountCentavos: 2000,
        paidBy: ben.id,
        split: {
          type: 'percent',
          shares: [
            { userId: ana.id, percent: 50 },
            { userId: ben.id, percent: 25 },
            { userId: cara.id, percent: 25 },
          ],
        },
      }),
    );
    assert.equal(created.status, 201);
    assert.deepEqual([await netOf(ana), await netOf(ben), await netOf(cara)], [-334, 1167, -833]);
  });

  it('only the people involved or an admin can change an expense', async () => {
    const byOutsider = await cara.client.request('DELETE', group(`/expenses/${firstExpenseId}`));
    assert.equal(byOutsider.status, 403);

    const edited = await ana.client.request(
      'PUT',
      group(`/expenses/${firstExpenseId}`),
      expense({ amountCentavos: 1200 }),
    );
    assert.equal(edited.status, 204);
    assert.deepEqual([await netOf(ana), await netOf(ben), await netOf(cara)], [-200, 1100, -900]);
  });

  it('records a payment, and only for the people involved', async () => {
    const payment = {
      fromUser: ana.id,
      toUser: ben.id,
      amountCentavos: 200,
      settledOn: '2026-11-02',
    };
    assert.equal((await cara.client.post(group('/settlements'), payment)).status, 403);
    assert.equal((await ana.client.post(group('/settlements'), payment)).status, 201);
    assert.equal(await netOf(ana), 0);
    assert.equal(await netOf(ben), 900);

    const toSelf = await ana.client.post(group('/settlements'), { ...payment, toUser: ana.id });
    assert.equal(toSelf.status, 400);
  });

  it('paginates lists and caps the page size', async () => {
    const page = (await ana.client.get(group('/expenses?limit=1'))).body;
    assert.equal(page.items.length, 1);
    assert.equal(page.nextOffset, 1);
    assert.equal(page.items[0].shares.length, 3);
    assert.equal((await ana.client.get(group('/expenses?limit=500'))).status, 400);

    const activity = (await ana.client.get(group('/activity'))).body;
    assert.ok(activity.items.some((a: { action: string }) => a.action === 'settlement_added'));

    const summary = (await ana.client.get(group('/summary'))).body;
    assert.deepEqual(summary.byCategory, [{ category: 'food', totalCentavos: 3200 }]);
  });

  it('pushes a "changed" message to members over the WebSocket', async () => {
    const socket = new WebSocket(`${app.baseUrl.replace('http', 'ws')}/api/ws`, {
      headers: { cookie: ana.client.cookieHeader(), origin: APP_URL },
    });
    const messages: { type: string; action?: string }[] = [];
    const next = (type: string) =>
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`No "${type}" message`)), 8000);
        socket.on('message', (data) => {
          const message = JSON.parse(String(data));
          messages.push(message);
          if (message.type === type) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
    try {
      await new Promise((resolve, reject) => socket.once('open', resolve).once('error', reject));
      const subscribed = next('subscribed');
      socket.send(JSON.stringify({ type: 'subscribe', groupId }));
      await subscribed;

      const changed = next('changed');
      await ben.client.post(
        group('/expenses'),
        expense({
          description: 'Snacks',
          paidBy: ben.id,
          split: { type: 'equal', participants: [ben.id, cara.id] },
        }),
      );
      await changed;
      assert.equal(messages.at(-1)?.action, 'expense_added');
    } finally {
      socket.terminate();
    }
  });

  it('refuses a WebSocket without a session or from another site', async () => {
    const attempt = (headers: Record<string, string>) =>
      new Promise<string>((resolve) => {
        const socket = new WebSocket(`${app.baseUrl.replace('http', 'ws')}/api/ws`, { headers });
        socket.once('open', () => resolve('open')).once('error', (error) => resolve(error.message));
      });
    assert.match(await attempt({ origin: APP_URL }), /401/);
    assert.match(
      await attempt({ cookie: ana.client.cookieHeader(), origin: 'https://evil.example' }),
      /403/,
    );
  });

  it('makes people settle up before they leave, then lets them rejoin', async () => {
    const owing = await cara.client.request('DELETE', group(`/members/${cara.id}`));
    assert.equal(owing.status, 409);

    assert.equal((await ana.client.request('DELETE', group(`/members/${ana.id}`))).status, 409);
    await ana.client.request('PATCH', group(`/members/${ben.id}`), { role: 'admin' });
    assert.equal((await ana.client.request('DELETE', group(`/members/${ana.id}`))).status, 204);
    assert.equal((await ana.client.get(group())).status, 404);

    assert.equal((await ana.client.post(`/api/invites/${inviteCode}/join`)).status, 200);
    assert.equal((await ana.client.get(group())).body.role, 'member');
  });

  it('lets an admin delete the group', async () => {
    assert.equal((await ana.client.request('DELETE', group())).status, 403);
    assert.equal((await ben.client.request('DELETE', group())).status, 204);
    assert.equal((await ben.client.get(group())).status, 404);
  });
});
