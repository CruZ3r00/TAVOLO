'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posrt-drm-'));
process.env.APP_DATA_DIR = tmpDir;
process.env.LOG_LEVEL = 'silent';

const { openDb, closeDb } = require('../../src/storage/db');
const { runMigrations } = require('../../src/storage/migrator');

before(() => {
  openDb();
  runMigrations();
});
after(() => closeDb());

const { DriverRegistry } = require('../../src/drivers/registry');

function makeRegistry() {
  return new DriverRegistry({
    printerName: 'stub',
    paymentName: 'stub',
    config: {
      drivers: {
        printer: 'stub',
        payment: 'stub',
        stub: { latencyMs: 0, failureRate: 0 },
      },
    },
  });
}

describe('DriverRegistry multi-printer', () => {
  test('loadAll initializes default printer and payment', async () => {
    const reg = makeRegistry();
    await reg.loadAll();
    assert.ok(reg.printer);
    assert.ok(reg.payment);
    assert.equal(reg.stationPrinters.size, 0);
    assert.equal(reg.cashDevices.size, 0);
  });

  test('loadFromTargets loads station printers (stub driver)', async () => {
    const reg = makeRegistry();
    await reg.loadAll();
    await reg.loadFromTargets([
      { role: 'station', key: 'cucina', driver: 'stub', host: '127.0.0.1', port: 9100, enabled: 1 },
      { role: 'station', key: 'bar', driver: 'stub', host: '127.0.0.2', port: 9100, enabled: 1 },
    ]);
    assert.equal(reg.stationPrinters.size, 2);
    assert.ok(reg.stationPrinters.get('cucina'));
    assert.ok(reg.stationPrinters.get('bar'));
  });

  test('loadFromTargets skips disabled rows', async () => {
    const reg = makeRegistry();
    await reg.loadAll();
    await reg.loadFromTargets([
      { role: 'station', key: 'cucina', driver: 'stub', enabled: 1 },
      { role: 'station', key: 'bar', driver: 'stub', enabled: 0 },
    ]);
    assert.equal(reg.stationPrinters.size, 1);
    assert.ok(reg.stationPrinters.get('cucina'));
    assert.equal(reg.stationPrinters.get('bar'), undefined);
  });

  test('getPrinterForStation returns station driver or fallback', async () => {
    const reg = makeRegistry();
    await reg.loadAll();
    await reg.loadFromTargets([
      { role: 'station', key: 'cucina', driver: 'stub', enabled: 1 },
    ]);
    const cucina = reg.getPrinterForStation('cucina');
    assert.ok(cucina);
    assert.notEqual(cucina, reg.printer); // dedicated driver, not default

    const bar = reg.getPrinterForStation('bar');
    assert.equal(bar, reg.printer); // fallback to default
  });

  test('loadFromTargets loads cash devices with capabilities', async () => {
    const reg = makeRegistry();
    await reg.loadAll();
    await reg.loadFromTargets([
      {
        role: 'cash',
        key: 'cassa1',
        driver: 'stub',
        host: '127.0.0.1',
        enabled: 1,
        capabilities_json: JSON.stringify({
          can_charge: true,
          can_print_fiscal: true,
          accepted_methods: ['cash', 'card'],
        }),
      },
    ]);
    assert.equal(reg.cashDevices.size, 1);
    const cassa = reg.cashDevices.get('cassa1');
    assert.ok(cassa);
    assert.ok(cassa.__capabilities.can_charge);
    assert.deepEqual(cassa.__capabilities.accepted_methods, ['cash', 'card']);
  });

  test('getCashDevice by id', async () => {
    const reg = makeRegistry();
    await reg.loadAll();
    await reg.loadFromTargets([
      { role: 'cash', key: 'cassa1', driver: 'stub', enabled: 1, capabilities_json: '{"can_charge":true}' },
      { role: 'cash', key: 'cassa2', driver: 'stub', enabled: 1, capabilities_json: '{"can_print_fiscal":true}' },
    ]);
    const d1 = reg.getCashDevice({ id: 'cassa1' });
    assert.equal(d1.__key, 'cassa1');
    const d2 = reg.getCashDevice({ id: 'cassa2' });
    assert.equal(d2.__key, 'cassa2');
  });

  test('getCashDevice by capability', async () => {
    const reg = makeRegistry();
    await reg.loadAll();
    await reg.loadFromTargets([
      { role: 'cash', key: 'cassa1', driver: 'stub', enabled: 1, capabilities_json: '{"can_charge":true}' },
      { role: 'cash', key: 'cassa2', driver: 'stub', enabled: 1, capabilities_json: '{"can_print_fiscal":true}' },
    ]);
    const fiscal = reg.getCashDevice({ capability: 'can_print_fiscal' });
    assert.equal(fiscal.__key, 'cassa2');
  });

  test('getCashDevice by accepted_method', async () => {
    const reg = makeRegistry();
    await reg.loadAll();
    await reg.loadFromTargets([
      { role: 'cash', key: 'cassa1', driver: 'stub', enabled: 1, capabilities_json: '{"can_charge":true,"accepted_methods":["cash"]}' },
      { role: 'cash', key: 'cassa2', driver: 'stub', enabled: 1, capabilities_json: '{"can_charge":true,"accepted_methods":["card"]}' },
    ]);
    const cardDev = reg.getCashDevice({ capability: 'can_charge', accepted_method: 'card' });
    assert.equal(cardDev.__key, 'cassa2');
    const cashDev = reg.getCashDevice({ capability: 'can_charge', accepted_method: 'cash' });
    assert.equal(cashDev.__key, 'cassa1');
  });

  test('getCashDevice falls back to default payment', async () => {
    const reg = makeRegistry();
    await reg.loadAll();
    // No cash devices loaded
    const dev = reg.getCashDevice({ id: 'nonexistent' });
    assert.equal(dev, reg.payment);
  });

  test('reload disposes old drivers and creates new ones', async () => {
    const reg = makeRegistry();
    await reg.loadAll();
    await reg.loadFromTargets([
      { role: 'station', key: 'cucina', driver: 'stub', enabled: 1 },
      { role: 'station', key: 'bar', driver: 'stub', enabled: 1 },
    ]);
    assert.equal(reg.stationPrinters.size, 2);

    // Reload with only cucina
    await reg.reload([
      { role: 'station', key: 'cucina', driver: 'stub', enabled: 1 },
    ]);
    assert.equal(reg.stationPrinters.size, 1);
    assert.ok(reg.stationPrinters.get('cucina'));
    assert.equal(reg.stationPrinters.get('bar'), undefined);
  });

  test('reload is single-flight', async () => {
    const reg = makeRegistry();
    await reg.loadAll();

    // Start two reloads simultaneously
    const p1 = reg.reload([{ role: 'station', key: 'a', driver: 'stub', enabled: 1 }]);
    const p2 = reg.reload([{ role: 'station', key: 'b', driver: 'stub', enabled: 1 }]);
    await Promise.all([p1, p2]);
    // One should have been skipped. The resulting state should be from p1.
    assert.ok(reg.stationPrinters.size <= 1);
  });

  test('status() includes stations and cash_devices', async () => {
    const reg = makeRegistry();
    await reg.loadAll();
    await reg.loadFromTargets([
      { role: 'station', key: 'cucina', driver: 'stub', enabled: 1 },
      { role: 'cash', key: 'cassa1', driver: 'stub', enabled: 1, capabilities_json: '{"can_charge":true}' },
    ]);

    const s = await reg.status();
    assert.ok(s.printer);
    assert.ok(s.payment);
    assert.ok(s.stations);
    assert.ok(s.stations.cucina);
    assert.ok(s.cash_devices);
    assert.ok(s.cash_devices.cassa1);
  });

  test('disposeAll disposes default + station + cash drivers', async () => {
    const reg = makeRegistry();
    await reg.loadAll();
    await reg.loadFromTargets([
      { role: 'station', key: 'cucina', driver: 'stub', enabled: 1 },
      { role: 'cash', key: 'cassa1', driver: 'stub', enabled: 1 },
    ]);
    // Should not throw
    await reg.disposeAll();
  });
});
