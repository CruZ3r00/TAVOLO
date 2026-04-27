'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posrt-storage-'));
process.env.APP_DATA_DIR = tmpDir;

const { openDb, closeDb } = require('../../src/storage/db');
const { runMigrations } = require('../../src/storage/migrator');
const jobQueueRepo = require('../../src/storage/repositories/jobQueueRepo');
const auditRepo = require('../../src/storage/repositories/auditRepo');
const configRepo = require('../../src/storage/repositories/configRepo');
const secretsRepo = require('../../src/storage/repositories/secretsRepo');
const keystore = require('../../src/utils/keystore');

before(async () => {
  await keystore.initMasterKey({ forceFallback: true });
  openDb();
  runMigrations();
});
after(() => closeDb());

test('migrations applicano schema', () => {
  const row = jobQueueRepo.stats();
  assert.ok(row);
  assert.equal(row.total, 0);
});

test('configRepo set/get', () => {
  configRepo.set('test.key', 'hello');
  assert.equal(configRepo.get('test.key'), 'hello');
  configRepo.remove('test.key');
  assert.equal(configRepo.get('test.key'), null);
});

test('secretsRepo cifra e decifra', () => {
  secretsRepo.set('my_secret', 'token-abc-123');
  assert.equal(secretsRepo.get('my_secret'), 'token-abc-123');
  assert.equal(secretsRepo.has('my_secret'), true);
  secretsRepo.remove('my_secret');
  assert.equal(secretsRepo.has('my_secret'), false);
});

test('jobQueue idempotency: duplicati scartati', () => {
  const job1 = jobQueueRepo.enqueue({ event_id: 'evt-1', kind: 'print.receipt', payload: { a: 1 } });
  assert.ok(job1);
  const job2 = jobQueueRepo.enqueue({ event_id: 'evt-1', kind: 'print.receipt', payload: { a: 1 } });
  assert.equal(job2, null);
  const s = jobQueueRepo.stats();
  assert.equal(s.pending, 1);
});

test('jobQueue claim/markDone', () => {
  const job = jobQueueRepo.enqueue({ event_id: 'evt-2', kind: 'print.receipt', payload: {} });
  const batch = jobQueueRepo.pickForDispatch(10);
  assert.ok(batch.find((r) => r.event_id === 'evt-2'));
  const claimed = jobQueueRepo.claim(job.id);
  assert.ok(claimed);
  assert.equal(claimed.status, 'in_progress');
  // second claim non riesce
  const claimed2 = jobQueueRepo.claim(job.id);
  assert.equal(claimed2, null);
  jobQueueRepo.markDone(job.id);
  assert.equal(jobQueueRepo.getById(job.id).status, 'done');
});

test('audit chain integrità', () => {
  const r1 = auditRepo.append({ kind: 'test.a', payload: { x: 1 } });
  const r2 = auditRepo.append({ kind: 'test.b', payload: { x: 2 } });
  const r3 = auditRepo.append({ kind: 'test.c', payload: { x: 3 } });
  assert.ok(r1.chain_hash && r2.chain_hash && r3.chain_hash);
  const ok = auditRepo.verifyChain();
  assert.equal(ok.valid, true);
  assert.ok(ok.checked > 0);
});

test('audit log è append-only (trigger blocca DELETE/UPDATE)', () => {
  const { getDb } = require('../../src/storage/db');
  const db = getDb();
  assert.throws(
    () => db.prepare('DELETE FROM audit_log WHERE id = 1').run(),
    /append-only/,
  );
  assert.throws(
    () => db.prepare('UPDATE audit_log SET kind = ? WHERE id = 1').run('tampered'),
    /append-only/,
  );
});
