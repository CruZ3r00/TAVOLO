'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posrt-ptr-'));
process.env.APP_DATA_DIR = tmpDir;
process.env.LOG_LEVEL = 'silent';

const { openDb, closeDb } = require('../../src/storage/db');
const { runMigrations } = require('../../src/storage/migrator');
const repo = require('../../src/storage/repositories/printerTargetsRepo');

before(() => {
  openDb();
  runMigrations();
});
after(() => closeDb());

describe('printerTargetsRepo', () => {
  test('list() returns empty on fresh DB', () => {
    const rows = repo.list();
    assert.ok(Array.isArray(rows));
    assert.equal(rows.length, 0);
  });

  test('upsertMany inserts new rows', () => {
    repo.upsertMany([
      { role: 'station', key: 'cucina', driver: 'escpos-network', host: '10.0.0.1', port: 9100 },
      { role: 'station', key: 'bar', driver: 'escpos-network', host: '10.0.0.2', port: 9100 },
      { role: 'cash', key: 'cassa1', driver: 'italretail', host: '10.0.0.10', port: 9100, capabilities_json: '{"can_print_fiscal":true}' },
    ]);
    const rows = repo.list();
    assert.equal(rows.length, 3);
    const cucina = repo.getByRoleKey('station', 'cucina');
    assert.equal(cucina.driver, 'escpos-network');
    assert.equal(cucina.host, '10.0.0.1');
  });

  test('upsertMany updates existing rows (UPSERT)', () => {
    repo.upsertMany([
      { role: 'station', key: 'cucina', driver: 'italretail', host: '10.0.0.99', port: 9100 },
    ]);
    const cucina = repo.getByRoleKey('station', 'cucina');
    assert.equal(cucina.driver, 'italretail');
    assert.equal(cucina.host, '10.0.0.99');
    // bar e cassa1 still exist
    assert.equal(repo.list().length, 3);
  });

  test('upsertMany is transactional', () => {
    const before = repo.list().length;
    try {
      repo.upsertMany([
        { role: 'station', key: 'pizzeria', driver: 'escpos-network', host: '10.0.0.3' },
        { role: 'INVALID_ROLE', key: 'x', driver: 'stub' }, // CHECK constraint violation
      ]);
    } catch (_) {
      // expected
    }
    // pizzeria should NOT have been inserted (rollback)
    assert.equal(repo.list().length, before);
  });

  test('removeMissing deletes rows not in keep list', () => {
    // Reset
    repo.clear();
    repo.upsertMany([
      { role: 'station', key: 'cucina', driver: 'escpos-network', host: '10.0.0.1' },
      { role: 'station', key: 'bar', driver: 'escpos-network', host: '10.0.0.2' },
      { role: 'station', key: 'pizzeria', driver: 'escpos-network', host: '10.0.0.3' },
      { role: 'cash', key: 'cassa1', driver: 'italretail', host: '10.0.0.10' },
    ]);
    assert.equal(repo.list().length, 4);

    const removed = repo.removeMissing([
      { role: 'station', key: 'cucina' },
      { role: 'cash', key: 'cassa1' },
    ]);
    assert.equal(removed, 2); // bar + pizzeria removed
    assert.equal(repo.list().length, 2);
    assert.ok(repo.getByRoleKey('station', 'cucina'));
    assert.ok(repo.getByRoleKey('cash', 'cassa1'));
    assert.equal(repo.getByRoleKey('station', 'bar'), undefined);
  });

  test('removeMissing with empty keepPairs deletes all', () => {
    repo.clear();
    repo.upsertMany([
      { role: 'station', key: 'cucina', driver: 'escpos-network', host: '10.0.0.1' },
    ]);
    const removed = repo.removeMissing([]);
    assert.equal(removed, 1);
    assert.equal(repo.list().length, 0);
  });

  test('listByRole filters correctly', () => {
    repo.clear();
    repo.upsertMany([
      { role: 'station', key: 'cucina', driver: 'escpos-network', host: '10.0.0.1', enabled: true },
      { role: 'station', key: 'bar', driver: 'escpos-network', host: '10.0.0.2', enabled: false },
      { role: 'cash', key: 'cassa1', driver: 'italretail', host: '10.0.0.10', enabled: true },
    ]);
    const stations = repo.listByRole('station');
    assert.equal(stations.length, 1); // only cucina (bar disabled)
    assert.equal(stations[0].key, 'cucina');
    const cash = repo.listByRole('cash');
    assert.equal(cash.length, 1);
  });

  test('options_json and capabilities_json stored as JSON string', () => {
    repo.clear();
    repo.upsertMany([
      {
        role: 'cash',
        key: 'cassa2',
        driver: 'nexi-p17',
        host: '10.0.0.20',
        options_json: { terminalId: 'T001' },
        capabilities_json: { can_charge: true, accepted_methods: ['card'] },
      },
    ]);
    const row = repo.getByRoleKey('cash', 'cassa2');
    assert.equal(typeof row.options_json, 'string');
    assert.equal(typeof row.capabilities_json, 'string');
    const opts = JSON.parse(row.options_json);
    assert.equal(opts.terminalId, 'T001');
    const caps = JSON.parse(row.capabilities_json);
    assert.equal(caps.can_charge, true);
    assert.deepEqual(caps.accepted_methods, ['card']);
  });
});
