import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { encode, parseQrPh, tlv } from './domain/qrph.js';
import { DEMO_ACCOUNT, resetDemo } from './services/demo.js';
import { skip, startTestApp, type Client } from './testing.js';

type Person = { client: Client; id: string };

const qrFor = (name: string) =>
  encode([
    { id: '00', value: '01' },
    { id: '01', value: '11' },
    { id: '27', value: tlv({ id: '00', value: 'com.p2pqrpay' }) + tlv({ id: '04', value: '09' }) },
    { id: '53', value: '608' },
    { id: '58', value: 'PH' },
    { id: '59', value: name },
  ]);

describe('payment QRs', { skip }, () => {
  let app: Awaited<ReturnType<typeof startTestApp>>;
  let ana: Person, ben: Person, outsider: Person;
  let groupId: string;
  const qrPath = (from: string, to: string) =>
    `/api/groups/${groupId}/payment-qr?from=${from}&to=${to}`;

  before(async () => {
    app = await startTestApp();
    [ana, ben, outsider] = (await Promise.all(
      ['qr_ana', 'qr_ben', 'qr_out'].map((name) => app.signUp(`${name}@example.com`)),
    )) as [Person, Person, Person];
    groupId = (await ana.client.post('/api/groups', { name: 'Trip' })).body.id;
    const { inviteCode } = (await ana.client.get(`/api/groups/${groupId}`)).body;
    await ben.client.post(`/api/invites/${inviteCode}/join`);
    // Ana pays 1,000.01 for both, so Ben owes her 500.01 (the odd centavo stays with Ana).
    await ana.client.post(`/api/groups/${groupId}/expenses`, {
      description: 'Ferry',
      amountCentavos: 100_001,
      category: 'transport',
      spentOn: '2026-11-01',
      paidBy: ana.id,
      split: { type: 'equal', participants: [ana.id, ben.id] },
    });
  });
  after(() => app.stop());

  it('saves, shows and removes your own QR, refusing anything that is not QR Ph', async () => {
    assert.equal((await ana.client.get('/api/auth/payment-qr')).body, null);

    const bad = await ana.client.request('PUT', '/api/auth/payment-qr', { payload: 'hello' });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.fields.payload);

    const saved = await ana.client.request('PUT', '/api/auth/payment-qr', {
      payload: qrFor('ANA REYES'),
    });
    assert.deepEqual(saved.body, { payeeName: 'ANA REYES' });
    assert.deepEqual((await ana.client.get('/api/auth/payment-qr')).body, {
      payeeName: 'ANA REYES',
    });

    const members = (await ben.client.get(`/api/groups/${groupId}`)).body.members;
    const flags = Object.fromEntries(members.map((m: any) => [m.userId, m.hasPaymentQr])); // eslint-disable-line @typescript-eslint/no-explicit-any -- test body
    assert.deepEqual(flags, { [ana.id]: true, [ben.id]: false });

    assert.equal((await ben.client.request('DELETE', '/api/auth/payment-qr')).status, 204);
  });

  it('makes the QR for a planned payment with the amount from the server', async () => {
    const reply = await ben.client.get(qrPath(ben.id, ana.id));
    assert.equal(reply.status, 200);
    assert.equal(reply.body.amountCentavos, 50_000);
    assert.equal(reply.body.payeeName, 'ANA REYES');
    assert.ok(reply.body.payload.includes('5406500.00'));
    assert.ok(parseQrPh(reply.body.payload));
  });

  it('answers 404 with no such payment, no QR, or for a non-member', async () => {
    assert.equal((await ben.client.get(qrPath(ana.id, ben.id))).status, 404);
    assert.equal((await outsider.client.get(qrPath(ben.id, ana.id))).status, 404);

    await ana.client.request('DELETE', '/api/auth/payment-qr');
    assert.equal((await ben.client.get(qrPath(ben.id, ana.id))).status, 404);
    assert.equal((await ben.client.get(qrPath('nope', ana.id))).status, 400);
  });

  it('keeps the demo account’s sample QR fixed', async () => {
    await resetDemo(app.ctx);
    const demo = app.client();
    await demo.post('/api/auth/sign-in', DEMO_ACCOUNT);
    assert.match((await demo.get('/api/auth/payment-qr')).body.payeeName, /^HATI DEMO/);
    const change = await demo.request('PUT', '/api/auth/payment-qr', { payload: qrFor('ME') });
    assert.equal(change.status, 403);
    assert.equal((await demo.request('DELETE', '/api/auth/payment-qr')).status, 403);
  });
});
