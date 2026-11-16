import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { encode, tlv } from './domain/qrph.js';
import { skip, startTestApp, type Client } from './testing.js';

type Person = { client: Client; id: string };

const benQr = encode([
  { id: '00', value: '01' },
  { id: '01', value: '11' },
  { id: '27', value: tlv({ id: '00', value: 'com.p2pqrpay' }) + tlv({ id: '04', value: '09' }) },
  { id: '53', value: '608' },
  { id: '58', value: 'PH' },
  { id: '59', value: 'BEN' },
]);

describe('group currency', { skip }, () => {
  let app: Awaited<ReturnType<typeof startTestApp>>;
  let ana: Person, ben: Person;
  let groupId: string;
  const group = (path = '') => `/api/groups/${groupId}${path}`;

  before(async () => {
    app = await startTestApp();
    [ana, ben] = (await Promise.all(
      ['cur_ana', 'cur_ben'].map((name) => app.signUp(`${name}@example.com`)),
    )) as [Person, Person];
  });
  after(() => app.stop());

  it('defaults a new group to pesos', async () => {
    const { body } = await ana.client.post('/api/groups', { name: 'Peso group' });
    const detail = (await ana.client.get(`/api/groups/${body.id}`)).body;
    assert.equal(detail.currency, 'PHP');
    assert.equal(detail.currencyLocked, false);
  });

  it('rejects a currency that is not on the list', async () => {
    const reply = await ana.client.post('/api/groups', { name: 'Bad', currency: 'BTC' });
    assert.equal(reply.status, 400);
    assert.ok(reply.body.error.fields.currency);
  });

  it('creates a group in yen and lists it with its currency', async () => {
    const created = await ana.client.post('/api/groups', { name: 'Tokyo trip', currency: 'JPY' });
    assert.equal(created.status, 201);
    groupId = created.body.id;
    assert.equal((await ana.client.get(group())).body.currency, 'JPY');

    const listed = (await ana.client.get('/api/groups')).body.groups;
    assert.equal(listed.find((g: { id: string }) => g.id === groupId).currency, 'JPY');

    const { inviteCode } = (await ana.client.get(group())).body;
    await ben.client.post(`/api/invites/${inviteCode}/join`);
  });

  it('lets only an admin change the currency while nothing is recorded', async () => {
    const byMember = await ben.client.request('PATCH', group(), { currency: 'KRW' });
    assert.equal(byMember.status, 403);
    assert.equal((await ana.client.request('PATCH', group(), { currency: 'KRW' })).status, 204);
    assert.equal((await ana.client.request('PATCH', group(), { currency: 'JPY' })).status, 204);
    assert.equal((await ana.client.get(group())).body.currency, 'JPY');
  });

  it('splits whole yen and writes the activity in yen', async () => {
    const ok = await ana.client.post(group('/expenses'), {
      description: 'Ramen',
      amountCentavos: 1001,
      category: 'food',
      spentOn: '2026-11-02',
      paidBy: ben.id,
      split: { type: 'equal', participants: [ana.id, ben.id] },
    });
    assert.equal(ok.status, 201);
    const [expense] = (await ana.client.get(group('/expenses'))).body.items;
    const share = (id: string) =>
      expense.shares.find((s: { userId: string }) => s.userId === id).shareCentavos;
    assert.equal(share(ana.id) + share(ben.id), 1001);
    assert.deepEqual([share(ana.id), share(ben.id)].sort(), [500, 501]);
    const [entry] = (await ana.client.get(group('/activity'))).body.items;
    assert.match(entry.summary, /¥1,001/);
  });

  it('locks the currency after the first expense', async () => {
    assert.equal((await ana.client.get(group())).body.currencyLocked, true);
    const reply = await ana.client.request('PATCH', group(), { currency: 'PHP' });
    assert.equal(reply.status, 409);
  });

  it('has no payment QR outside peso groups', async () => {
    await ben.client.post('/api/auth/payment-qrs', { label: 'GCash', payload: benQr });
    const reply = await ana.client.get(group(`/payment-qr?from=${ana.id}&to=${ben.id}`));
    assert.equal(reply.status, 404);
  });
});
