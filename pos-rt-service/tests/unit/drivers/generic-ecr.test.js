'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const { GenericEcrDriver } = require('../../../src/drivers/payment/generic-ecr');

function frame(xml) {
  const body = Buffer.from(xml, 'utf8');
  const len = String(body.length).padStart(4, '0');
  return Buffer.concat([Buffer.from(len, 'ascii'), body]);
}

function readFrame(sock, cb) {
  let buf = Buffer.alloc(0);
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (buf.length >= 4) {
      const expected = parseInt(buf.subarray(0, 4).toString('ascii'), 10);
      if (buf.length >= 4 + expected) {
        const xml = buf.subarray(4, 4 + expected).toString('utf8');
        cb(xml, sock);
      }
    }
  });
}

// Auto-risponde con Diagnosis success se la richiesta lo è, altrimenti
// passa al callback dell'utente.
function diagnosisAware(sock, paymentHandler) {
  readFrame(sock, (xml, s) => {
    if (/RequestType="Diagnosis"/.test(xml)) {
      const reqId = (xml.match(/RequestID="([^"]+)"/) || [])[1];
      const resp =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<ServiceResponse RequestType="Diagnosis" RequestID="${reqId}" OverallResult="Success"/>`;
      s.write(frame(resp));
      return;
    }
    paymentHandler(xml, s);
  });
}

test('GenericEcrDriver charge: success', async () => {
  const server = net.createServer((sock) => {
    diagnosisAware(sock, (xml, s) => {
      assert.match(xml, /RequestType="Payment"/);
      assert.match(xml, /<TotalAmount Currency="978">2599<\/TotalAmount>/);
      const reqId = (xml.match(/RequestID="([^"]+)"/) || [])[1];
      const resp =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<ServiceResponse RequestType="Payment" RequestID="${reqId}" WorkstationID="POS01" OverallResult="Success">` +
        `<Tender><Authorisation ApprovalCode="AUTH-12345"/><TotalAmount Currency="978">2599</TotalAmount></Tender>` +
        `<TransactionID>TX-99887766</TransactionID>` +
        `</ServiceResponse>`;
      s.write(frame(resp));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const drv = new GenericEcrDriver({
      host: '127.0.0.1',
      port: server.address().port,
      timeoutMs: 5_000,
    });
    const out = await drv.charge({ amount: 25.99, idempotencyKey: 'evt-x' });
    assert.equal(out.success, true);
    assert.equal(out.transactionId, 'TX-99887766');
    assert.equal(out.amount, 25.99);
  } finally {
    server.close();
  }
});

test('GenericEcrDriver charge: declined', async () => {
  const server = net.createServer((sock) => {
    diagnosisAware(sock, (xml, s) => {
      const reqId = (xml.match(/RequestID="([^"]+)"/) || [])[1];
      const resp =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<ServiceResponse RequestType="Payment" RequestID="${reqId}" OverallResult="Failure" AuthorisationResult="04">` +
        `<ErrorMessage>Card declined</ErrorMessage>` +
        `</ServiceResponse>`;
      s.write(frame(resp));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const drv = new GenericEcrDriver({ host: '127.0.0.1', port: server.address().port, timeoutMs: 5_000 });
    await assert.rejects(drv.charge({ amount: 10 }), /Card declined|PAYMENT_DECLINED/);
  } finally {
    server.close();
  }
});

test('GenericEcrDriver timeout', async () => {
  const server = net.createServer((sock) => {
    // Non risponde mai: il driver deve scattare in timeout.
    sock.on('data', () => {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const drv = new GenericEcrDriver({ host: '127.0.0.1', port: server.address().port, timeoutMs: 200 });
    await assert.rejects(drv.charge({ amount: 1 }), /timeout/);
  } finally {
    server.close();
  }
});
