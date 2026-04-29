'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posrt-qm-'));
process.env.APP_DATA_DIR = tmpDir;
process.env.LOG_LEVEL = 'silent';

const { openDb, closeDb } = require('../../src/storage/db');
const { runMigrations } = require('../../src/storage/migrator');
const { QueueManager } = require('../../src/services/queueManager');
const jobQueueRepo = require('../../src/storage/repositories/jobQueueRepo');

before(() => {
  openDb();
  runMigrations();
});
after(() => closeDb());

test('enqueue idempotente → dispatch → markDone', async () => {
  let handled = 0;
  const qm = new QueueManager({
    handlers: {
      'test.kind': async () => {
        handled++;
        return { ok: true };
      },
    },
    maxAttempts: 3,
    concurrency: 1,
  });

  const a = qm.enqueue({ event_id: 'e-unique-1', kind: 'test.kind', payload: {} });
  const b = qm.enqueue({ event_id: 'e-unique-1', kind: 'test.kind', payload: {} });
  assert.equal(a, true);
  assert.equal(b, false);

  await qm.dispatch();
  assert.equal(handled, 1);
  const row = jobQueueRepo.getByEventId('e-unique-1');
  assert.equal(row.status, 'done');
});

test('failure → retry schedulato con next_attempt_at futuro', async () => {
  const qm = new QueueManager({
    handlers: {
      'test.fail': async () => {
        throw new Error('boom');
      },
    },
    maxAttempts: 3,
    concurrency: 1,
  });
  qm.enqueue({ event_id: 'e-fail-1', kind: 'test.fail', payload: {} });
  await qm.dispatch();
  const row = jobQueueRepo.getByEventId('e-fail-1');
  assert.equal(row.status, 'pending');
  assert.ok(row.attempts >= 1);
  assert.ok(new Date(row.next_attempt_at).getTime() > Date.now() - 1000);
});

test('raggiunto maxAttempts → dead_letter', async () => {
  const qm = new QueueManager({
    handlers: {
      'test.kill': async () => {
        throw new Error('always');
      },
    },
    maxAttempts: 2,
    concurrency: 1,
  });
  qm.enqueue({ event_id: 'e-kill-1', kind: 'test.kill', payload: {} });
  // forza due esecuzioni consecutive bypassando il retry delay
  for (let i = 0; i < 2; i++) {
    const row = jobQueueRepo.getByEventId('e-kill-1');
    if (row.next_attempt_at) {
      // sposta manualmente next_attempt_at nel passato
      const db = require('../../src/storage/db').getDb();
      db.prepare('UPDATE job_queue SET next_attempt_at = ? WHERE id = ?').run(
        new Date(Date.now() - 1000).toISOString(),
        row.id,
      );
    }
    await qm.dispatch();
  }
  const final = jobQueueRepo.getByEventId('e-kill-1');
  assert.equal(final.status, 'dead_letter');
});
