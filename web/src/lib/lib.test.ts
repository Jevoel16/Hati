import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { redactUrl } from './analytics.ts';
import {
  liveTransition,
  reconnectDelayMs,
  remoteReducer,
  submissionReducer,
  type Remote,
  type Submission,
} from './machines.ts';
import { describeBalance, parsePesos, toPesoInput } from './money.ts';

describe('parsePesos', () => {
  it('turns typed pesos into centavos without float errors', () => {
    assert.equal(parsePesos('1250.5'), 125_050);
    assert.equal(parsePesos('0.07'), 7);
    assert.equal(parsePesos('1,250'), 125_000);
    assert.equal(parsePesos('19.99'), 1999);
  });

  it('rejects anything that is not a plain amount', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1e3', '12345678']) {
      assert.equal(parsePesos(bad), null);
    }
  });

  it('round-trips through the input format', () => {
    assert.equal(parsePesos(toPesoInput(125_050)), 125_050);
  });
});

describe('redactUrl', () => {
  it('hides group ids and invite codes', () => {
    assert.equal(
      redactUrl('https://hati.test/groups/42/expenses'),
      'https://hati.test/groups/[id]/expenses',
    );
    assert.equal(redactUrl('https://hati.test/groups/42'), 'https://hati.test/groups/[id]');
    assert.equal(redactUrl('https://hati.test/join/s3cret'), 'https://hati.test/join/[code]');
  });

  it('drops the query string and leaves other paths alone', () => {
    assert.equal(
      redactUrl('https://hati.test/sign-in?next=%2Fjoin%2Fs3cret#x'),
      'https://hati.test/sign-in',
    );
    assert.equal(redactUrl('https://hati.test/groups'), 'https://hati.test/groups');
  });
});

describe('describeBalance', () => {
  it('uses words for owed, owing and settled', () => {
    assert.match(describeBalance(1000, 'you'), /^You are owed /);
    assert.match(describeBalance(-1000, 'you'), /^You owe /);
    assert.equal(describeBalance(0, 'you'), 'You are settled up');
    assert.match(describeBalance(-50, 'they'), /^owes /);
  });
});

describe('remote data machine', () => {
  const loading: Remote<number> = { status: 'loading' };
  const success: Remote<number> = { status: 'success', data: 1 };
  const failed: Remote<number> = { status: 'failed', message: 'x', code: 'internal_error' };

  it('loading -> success or failed', () => {
    assert.deepEqual(remoteReducer(loading, { type: 'loaded', data: 2 }), {
      status: 'success',
      data: 2,
    });
    assert.equal(remoteReducer(loading, { ...failed, type: 'failed' }).status, 'failed');
  });

  it('a failed refresh keeps the data on screen', () => {
    assert.equal(remoteReducer(success, { ...failed, type: 'failed' }), success);
  });

  it('losing access replaces the data with the error', () => {
    const next = remoteReducer(success, { type: 'failed', message: 'gone', code: 'not_found' });
    assert.equal(next.status, 'failed');
  });

  it('reload restarts only from failed', () => {
    assert.deepEqual(remoteReducer(failed, { type: 'reload' }), loading);
    assert.equal(remoteReducer(success, { type: 'reload' }), success);
  });
});

describe('submission machine', () => {
  const editing: Submission = { status: 'editing' };
  const submitting: Submission = { status: 'submitting' };

  it('editing -> submitting -> editing on success', () => {
    assert.deepEqual(submissionReducer(editing, { type: 'submit' }), submitting);
    assert.deepEqual(submissionReducer(submitting, { type: 'succeeded' }), editing);
  });

  it('a failure carries the message and field errors, and can be retried', () => {
    const failed = submissionReducer(submitting, {
      type: 'failed',
      message: 'Check the fields',
      fields: { name: 'Required' },
    });
    assert.deepEqual(failed, {
      status: 'failed',
      message: 'Check the fields',
      fields: { name: 'Required' },
    });
    assert.deepEqual(submissionReducer(failed, { type: 'submit' }), submitting);
  });

  it('ignores a second submit while one is in flight', () => {
    assert.equal(submissionReducer(submitting, { type: 'submit' }), submitting);
    assert.equal(submissionReducer(editing, { type: 'succeeded' }), editing);
  });
});

describe('live connection machine', () => {
  it('follows connect, drop and reconnect', () => {
    assert.equal(liveTransition('connecting', 'opened'), 'open');
    assert.equal(liveTransition('open', 'dropped'), 'reconnecting');
    assert.equal(liveTransition('reconnecting', 'opened'), 'open');
    assert.equal(liveTransition('open', 'denied'), 'closed');
  });

  it('closed is final', () => {
    assert.equal(liveTransition('closed', 'opened'), 'closed');
    assert.equal(liveTransition('closed', 'dropped'), 'closed');
  });

  it('backs off up to 15 seconds', () => {
    assert.deepEqual([0, 1, 2, 10].map(reconnectDelayMs), [1000, 2000, 4000, 15_000]);
  });
});
