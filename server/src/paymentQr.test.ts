import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { encode, parseQrPh, tlv } from './domain/qrph.js';
import { migrate } from './migrate.js';
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

  const addQr = (who: Person, label: string, name = 'ANA REYES') =>
    who.client.post('/api/auth/payment-qrs', { label, payload: qrFor(name) });

  it('saves and lists several QRs, refusing anything that is not QR Ph', async () => {
    assert.deepEqual((await ana.client.get('/api/auth/payment-qrs')).body, { methods: [] });

    const bad = await ana.client.post('/api/auth/payment-qrs', { label: 'GCash', payload: 'hi' });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.fields.payload);

    const gcash = await addQr(ana, 'GCash');
    assert.equal(gcash.status, 201);
    assert.equal(gcash.body.payeeName, 'ANA REYES');
    assert.equal((await addQr(ana, 'Landbank')).status, 201);

    const { methods } = (await ana.client.get('/api/auth/payment-qrs')).body;
    assert.deepEqual(
      methods.map((m: { label: string }) => m.label),
      ['GCash', 'Landbank'],
    );
    assert.equal(methods[0].payload, undefined);

    const members = (await ben.client.get(`/api/groups/${groupId}`)).body.members;
    const flags = Object.fromEntries(members.map((m: any) => [m.userId, m.hasPaymentQr])); // eslint-disable-line @typescript-eslint/no-explicit-any -- test body
    assert.deepEqual(flags, { [ana.id]: true, [ben.id]: false });
  });

  it('refuses a repeated name and a sixth QR', async () => {
    const again = await addQr(ana, 'gcash');
    assert.equal(again.status, 400);
    assert.ok(again.body.error.fields.label);

    for (const label of ['Maya', 'BDO', 'BPI']) assert.equal((await addQr(ana, label)).status, 201);
    assert.equal((await addQr(ana, 'GoTyme')).status, 400);
  });

  it('lets only the owner remove a QR', async () => {
    const { methods } = (await ana.client.get('/api/auth/payment-qrs')).body;
    const maya = methods.find((m: { label: string }) => m.label === 'Maya');
    const path = `/api/auth/payment-qrs/${maya.id}`;
    assert.equal((await ben.client.request('DELETE', path)).status, 404);
    assert.equal((await ana.client.request('DELETE', path)).status, 204);
    assert.equal((await ana.client.request('DELETE', path)).status, 404);
  });

  it('gives every QR for a planned payment, each with the amount from the server', async () => {
    const reply = await ben.client.get(qrPath(ben.id, ana.id));
    assert.equal(reply.status, 200);
    assert.equal(reply.body.amountCentavos, 50_000);
    assert.deepEqual(
      reply.body.methods.map((m: { label: string }) => m.label),
      ['GCash', 'Landbank', 'BDO', 'BPI'],
    );
    for (const method of reply.body.methods) {
      assert.equal(method.payeeName, 'ANA REYES');
      assert.ok(method.payload.includes('5406500.00'));
      assert.ok(parseQrPh(method.payload));
    }
  });

  it('answers 404 with no such payment, no QR, or for a non-member', async () => {
    assert.equal((await ben.client.get(qrPath(ana.id, ben.id))).status, 404);
    assert.equal((await outsider.client.get(qrPath(ben.id, ana.id))).status, 404);

    const { methods } = (await ana.client.get('/api/auth/payment-qrs')).body;
    for (const m of methods) await ana.client.request('DELETE', `/api/auth/payment-qrs/${m.id}`);
    assert.equal((await ben.client.get(qrPath(ben.id, ana.id))).status, 404);
    assert.equal((await ben.client.get(qrPath('nope', ana.id))).status, 400);
  });

  it('keeps the demo account’s sample QRs fixed', async () => {
    await resetDemo(app.ctx);
    const demo = app.client();
    await demo.post('/api/auth/sign-in', DEMO_ACCOUNT);
    const { methods } = (await demo.get('/api/auth/payment-qrs')).body;
    assert.deepEqual(
      methods.map((m: { label: string }) => m.label),
      ['GCash', 'Landbank'],
    );
    assert.match(methods[0].payeeName, /^HATI DEMO/);
    const add = await demo.post('/api/auth/payment-qrs', { label: 'Maya', payload: qrFor('ME') });
    assert.equal(add.status, 403);
    const remove = await demo.request('DELETE', `/api/auth/payment-qrs/${methods[0].id}`);
    assert.equal(remove.status, 403);
  });

  it('migration 004 turns an old single QR into the first method', async () => {
    const { db } = app.ctx;
    await db.query('ALTER TABLE users ADD COLUMN payment_qr VARCHAR(512) NULL');
    await db.query('UPDATE users SET payment_qr = ? WHERE id = ?', [qrFor('BEN CRUZ'), ben.id]);
    await db.query("DELETE FROM schema_migrations WHERE name = '004_payment_methods.sql'");
    assert.deepEqual(await migrate(db), ['004_payment_methods.sql']);

    const { methods } = (await ben.client.get('/api/auth/payment-qrs')).body;
    assert.deepEqual(
      methods.map((m: { label: string; payeeName: string }) => [m.label, m.payeeName]),
      [['QR Ph', 'BEN CRUZ']],
    );
  });
});
