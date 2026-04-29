'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { EpsonFpMateDriver } = require('../../../src/drivers/printer/epson-fpmate');

function startMockRt(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => handler(req, body, res));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('EpsonFpMateDriver: builds fiscal XML and parses success', async () => {
  let receivedBody = null;
  const server = await startMockRt((req, body, res) => {
    receivedBody = body;
    res.writeHead(200, { 'Content-Type': 'application/xml' });
    res.end(
      `<response success="true" code="0" status="ok"><receiptNumber>123</receiptNumber></response>`,
    );
  });
  try {
    const drv = new EpsonFpMateDriver({ host: '127.0.0.1', port: server.address().port, timeoutMs: 5_000 });
    const out = await drv.printFiscalReceipt({
      items: [
        { name: 'Pizza Margherita', quantity: 1, unit_price: 8.0 },
        { name: 'Coca-Cola', quantity: 2, unit_price: 3.5 },
      ],
      total: 15.0,
      payment_method: 'cash',
    });
    assert.equal(out.success, true);
    assert.equal(out.receipt_no, '123');
    assert.equal(out.fiscal, true);
    // Verifico che l'XML inviato contenga i tag fiscali principali
    assert.match(receivedBody, /<beginFiscalReceipt operator="1"\/>/);
    assert.match(receivedBody, /<printRecItem description="Pizza Margherita" quantity="1" unitPrice="800"/);
    assert.match(receivedBody, /<printRecItem description="Coca-Cola" quantity="2" unitPrice="350"/);
    assert.match(receivedBody, /<printRecTotal payment="1500" description="cash" paymentType="0"\/>/);
    assert.match(receivedBody, /<endFiscalReceipt\/>/);
  } finally {
    server.close();
  }
});

test('EpsonFpMateDriver: parses RT error response', async () => {
  const server = await startMockRt((req, body, res) => {
    res.writeHead(200, { 'Content-Type': 'application/xml' });
    res.end(`<response success="false" code="42" status="carta esaurita"/>`);
  });
  try {
    const drv = new EpsonFpMateDriver({ host: '127.0.0.1', port: server.address().port, timeoutMs: 5_000 });
    await assert.rejects(
      drv.printFiscalReceipt({ items: [{ name: 'a', quantity: 1, unit_price: 1 }], total: 1 }),
      /carta esaurita|code=42/,
    );
  } finally {
    server.close();
  }
});

test('EpsonFpMateDriver: getStatus reads queryPrinterStatus', async () => {
  let bodyXml = null;
  const server = await startMockRt((req, body, res) => {
    bodyXml = body;
    res.writeHead(200);
    res.end(`<response success="true" code="100" status="ready"/>`);
  });
  try {
    const drv = new EpsonFpMateDriver({ host: '127.0.0.1', port: server.address().port, timeoutMs: 5_000 });
    const st = await drv.getStatus();
    assert.equal(st.online, true);
    assert.match(bodyXml, /<queryPrinterStatus statusType="1"\/>/);
  } finally {
    server.close();
  }
});

test('EpsonFpMateDriver: payment_method maps correctly', async () => {
  // Filtra le query status (mandate da init()): tieni solo le richieste fiscali.
  let fiscalBodies = [];
  const server = await startMockRt((req, body, res) => {
    if (/<printerFiscalReceipt>/.test(body)) fiscalBodies.push(body);
    res.writeHead(200);
    res.end(`<response success="true" code="0" status="ok"/>`);
  });
  try {
    const drv = new EpsonFpMateDriver({ host: '127.0.0.1', port: server.address().port, timeoutMs: 5_000 });
    await drv.printFiscalReceipt({ items: [{ name: 'a', quantity: 1, unit_price: 1 }], total: 1, payment_method: 'card' });
    await drv.printFiscalReceipt({ items: [{ name: 'b', quantity: 1, unit_price: 2 }], total: 2, payment_method: 'meal_voucher' });
    await drv.printFiscalReceipt({ items: [{ name: 'c', quantity: 1, unit_price: 3 }], total: 3, payment_method: 'cash' });
    assert.match(fiscalBodies[0], /paymentType="2"/);
    assert.match(fiscalBodies[1], /paymentType="3"/);
    assert.match(fiscalBodies[2], /paymentType="0"/);
  } finally {
    server.close();
  }
});
