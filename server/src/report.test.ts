import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { BOM } from './domain/csv.js';
import { skip, startTestApp, type Client } from './testing.js';

type Person = { client: Client; id: string };

describe('monthly CSV report', { skip }, () => {
  let app: Awaited<ReturnType<typeof startTestApp>>;
  let ana: Person, ben: Person, outsider: Person;
  let groupId: string;

  // The test client parses JSON only, so the CSV is fetched raw.
  const download = async (person: Person | null, query: string, id = groupId) => {
    const response = await fetch(`${app.baseUrl}/api/groups/${id}/report?${query}`, {
      headers: person ? { cookie: person.client.cookieHeader() } : {},
    });
    // response.text() would drop the byte-order mark this test checks for.
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await response.arrayBuffer());
    return { response, text };
  };
  const lines = (text: string) => text.replace(BOM, '').trimEnd().split('\r\n');

  before(async () => {
    app = await startTestApp();
    [ana, ben, outsider] = (await Promise.all(
      ['rep_ana', 'rep_ben', 'rep_out'].map((name) => app.signUp(`${name}@example.com`)),
    )) as [Person, Person, Person];

    groupId = (await ana.client.post('/api/groups', { name: 'Unit 3B — Peña' })).body.id;
    const { inviteCode } = (await ana.client.get(`/api/groups/${groupId}`)).body;
    await ben.client.post(`/api/invites/${inviteCode}/join`);

    const expense = (description: string, spentOn: string, amountCentavos: number) =>
      ana.client.post(`/api/groups/${groupId}/expenses`, {
        description,
        amountCentavos,
        category: 'food',
        spentOn,
        paidBy: ana.id,
        split: { type: 'equal', participants: [ana.id, ben.id] },
      });
    await expense('Rice, eggs', '2026-11-03', 125_050);
    await expense('=HYPERLINK("http://evil.example")', '2026-11-04', 1000);
    await expense('October rent', '2026-10-31', 500_000);
    await ben.client.post(`/api/groups/${groupId}/settlements`, {
      fromUser: ben.id,
      toUser: ana.id,
      amountCentavos: 62_525,
      settledOn: '2026-11-05',
    });
  });
  after(() => app.stop());

  it('downloads the month as a CSV attachment', async () => {
    const { response, text } = await download(ben, 'month=2026-11');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^text\/csv/);
    assert.equal(
      response.headers.get('content-disposition'),
      'attachment; filename="hati-unit-3b-pena-2026-11.csv"',
    );
    assert.ok(text.startsWith(BOM));

    const [header, ...rows] = lines(text);
    assert.equal(
      header,
      'Date,Type,Description,Category,Paid by,Amount (PHP),rep_ana share,rep_ben share',
    );
    assert.deepEqual(rows, [
      '2026-11-03,Expense,"Rice, eggs",Food,rep_ana,1250.50,625.25,625.25',
      `2026-11-04,Expense,"'=HYPERLINK(""http://evil.example"")",Food,rep_ana,10.00,5.00,5.00`,
      '2026-11-05,Payment,Paid rep_ana,,rep_ben,625.25,,',
    ]);
  });

  it('gives only the header for a month with nothing in it', async () => {
    const { text } = await download(ana, 'month=2025-01');
    assert.equal(lines(text).length, 1);
  });

  it('writes whole numbers for a zero-decimal currency', async () => {
    const yen = (await ana.client.post('/api/groups', { name: 'Tokyo', currency: 'JPY' })).body.id;
    await ana.client.post(`/api/groups/${yen}/expenses`, {
      description: 'Ramen',
      amountCentavos: 1200,
      category: 'food',
      spentOn: '2026-11-02',
      paidBy: ana.id,
      split: { type: 'equal', participants: [ana.id] },
    });
    const [header, row] = lines((await download(ana, 'month=2026-11', yen)).text);
    assert.match(header!, /Amount \(JPY\)/);
    assert.equal(row, '2026-11-02,Expense,Ramen,Food,rep_ana,1200,1200');
  });

  it('rejects a month that is not YYYY-MM', async () => {
    for (const query of ['month=2026-13', 'month=2026-1', 'month=november', '']) {
      assert.equal((await download(ana, query)).response.status, 400, query);
    }
  });

  it('is for members only', async () => {
    assert.equal((await download(outsider, 'month=2026-11')).response.status, 404);
    assert.equal((await download(null, 'month=2026-11')).response.status, 401);
  });
});
