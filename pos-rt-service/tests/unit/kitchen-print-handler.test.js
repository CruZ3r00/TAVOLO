'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posrt-kph-'));
process.env.APP_DATA_DIR = tmpDir;
process.env.LOG_LEVEL = 'silent';

const { openDb, closeDb } = require('../../src/storage/db');
const { runMigrations } = require('../../src/storage/migrator');

before(() => {
  openDb();
  runMigrations();
});
after(() => closeDb());

const { createPrintKitchenTicketHandler } = require('../../src/modules/kitchen-print');
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

describe('kitchen-print handler', () => {
  test('ok path: driver with printKitchenTicket', async () => {
    const calls = [];
    const mockDriver = {
      name: 'mock-kt',
      async printKitchenTicket(data) {
        calls.push(data);
        return { success: true, receipt_no: 'KT-001', driver: 'mock-kt' };
      },
      async getStatus() { return { online: true }; },
      async dispose() {},
    };

    const reg = makeRegistry();
    await reg.loadAll();
    reg.stationPrinters.set('cucina', mockDriver);

    const handler = createPrintKitchenTicketHandler({ driverRegistry: reg });
    const result = await handler(
      {
        target: { role: 'station', key: 'cucina' },
        items: [{ name: 'Pasta al ragu', quantity: 2 }],
        action: 'add',
        printed_at: '2026-01-01T12:00:00Z',
      },
      { job: { event_id: 'evt-kt-1' } },
    );

    assert.equal(result.station, 'cucina');
    assert.equal(result.receipt_no, 'KT-001');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].station, 'cucina');
    assert.equal(calls[0].items.length, 1);
  });

  test('fallback: driver without printKitchenTicket uses printReceipt', async () => {
    const calls = [];
    const mockDriver = {
      name: 'mock-receipt-only',
      async printReceipt(data) {
        calls.push(data);
        return { success: true, receipt_no: 'RC-001', driver: 'mock-receipt-only' };
      },
      async getStatus() { return { online: true }; },
      async dispose() {},
    };

    const reg = makeRegistry();
    await reg.loadAll();
    reg.stationPrinters.set('bar', mockDriver);

    const handler = createPrintKitchenTicketHandler({ driverRegistry: reg });
    const result = await handler(
      {
        target: { key: 'bar' },
        items: [{ name: 'Birra', quantity: 3, notes: 'fredda' }],
        action: 'add',
      },
      { job: { event_id: 'evt-kt-2' } },
    );

    assert.equal(result.station, 'bar');
    assert.equal(result.receipt_no, 'RC-001');
    assert.equal(calls.length, 1);
    assert.ok(calls[0].header.includes('BAR'));
  });

  test('default station is cucina when target is absent', async () => {
    const reg = makeRegistry();
    await reg.loadAll();
    // No station printers loaded; will fallback to default printer (stub)

    const handler = createPrintKitchenTicketHandler({ driverRegistry: reg });
    const result = await handler(
      {
        items: [{ name: 'Pizza', quantity: 1 }],
      },
      { job: { event_id: 'evt-kt-3' } },
    );

    assert.equal(result.station, 'cucina');
  });

  test('zod validation: items must be an array', async () => {
    const reg = makeRegistry();
    await reg.loadAll();
    const handler = createPrintKitchenTicketHandler({ driverRegistry: reg });

    await assert.rejects(
      () => handler({ items: 'not_array' }, { job: { event_id: 'evt-kt-4' } }),
      (err) => err.code === 'INVALID_PAYLOAD',
    );
  });

  test('audit event emitted on success', async () => {
    const reg = makeRegistry();
    await reg.loadAll();

    const handler = createPrintKitchenTicketHandler({ driverRegistry: reg });
    await handler(
      {
        target: { key: 'cucina' },
        items: [{ name: 'Risotto', quantity: 1 }],
        action: 'add',
      },
      { job: { event_id: 'evt-kt-5' } },
    );

    // Verify audit was written
    const auditRepo = require('../../src/storage/repositories/auditRepo');
    const audits = auditRepo.list({ kind: 'kitchen_ticket.printed', limit: 10 });
    const match = audits.find((a) => a.event_id === 'evt-kt-5');
    assert.ok(match, 'Audit event should exist');
  });

  test('audit event emitted on failure', async () => {
    const mockDriver = {
      name: 'mock-fail',
      async printReceipt() {
        throw new Error('stampante offline');
      },
      async getStatus() { return { online: false }; },
      async dispose() {},
    };

    const reg = makeRegistry();
    await reg.loadAll();
    reg.stationPrinters.set('cucina', mockDriver);

    const handler = createPrintKitchenTicketHandler({ driverRegistry: reg });
    await assert.rejects(
      () => handler(
        { target: { key: 'cucina' }, items: [{ name: 'Test', quantity: 1 }] },
        { job: { event_id: 'evt-kt-6' } },
      ),
      /stampante offline/,
    );

    const auditRepo = require('../../src/storage/repositories/auditRepo');
    const audits = auditRepo.list({ kind: 'kitchen_ticket.print_failed', limit: 10 });
    const match = audits.find((a) => a.event_id === 'evt-kt-6');
    assert.ok(match, 'Failure audit event should exist');
  });

  test('cancel action propagates to driver', async () => {
    const calls = [];
    const mockDriver = {
      name: 'mock-cancel',
      async printKitchenTicket(data) {
        calls.push(data);
        return { success: true, receipt_no: 'KT-C01', driver: 'mock-cancel' };
      },
      async getStatus() { return { online: true }; },
      async dispose() {},
    };

    const reg = makeRegistry();
    await reg.loadAll();
    reg.stationPrinters.set('cucina', mockDriver);

    const handler = createPrintKitchenTicketHandler({ driverRegistry: reg });
    await handler(
      {
        target: { key: 'cucina' },
        items: [{ name: 'Pasta', quantity: 1 }],
        action: 'cancel',
        title: 'ANNULLA COMANDA',
      },
      { job: { event_id: 'evt-kt-7' } },
    );

    assert.equal(calls[0].action, 'cancel');
    assert.equal(calls[0].title, 'ANNULLA COMANDA');
  });
});
