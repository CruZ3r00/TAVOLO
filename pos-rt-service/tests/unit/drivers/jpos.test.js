'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const { JposDriver, encodeIso8583, decodeIso8583 } = require('../../../src/drivers/payment/jpos');

test('encodeIso8583 + decodeIso8583 round-trip purchase', () => {
  const fields = {
    3: '000000',
    4: '000000150000', // 150,00 EUR
    7: '0426120000',
    11: '000123',
    37: 'REF000000001',
    41: 'POS00001',
    49: '978',
  };
  const buf = encodeIso8583('0200', fields);
  const decoded = decodeIso8583(buf);
  assert.equal(decoded.mti, '0200');
  assert.equal(decoded.fields[3], '000000');
  assert.equal(decoded.fields[4], '000000150000');
  assert.equal(decoded.fields[11], '000123');
  assert.equal(decoded.fields[49], '978');
});

test('encodeIso8583 throws on invalid MTI', () => {
  assert.throws(() => encodeIso8583('xxx', {}), /MTI invalido/);
});

test('encodeIso8583 throws on field with wrong length', () => {
  assert.throws(() => encodeIso8583('0200', { 4: '12345' }), /lunghezza errata/);
});

function mockJpos(handler) {
  return net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length < 2) return;
      const len = buf.readUInt16BE(0);
      if (buf.length < 2 + len) return;
      const payload = buf.subarray(2, 2 + len);
      buf = buf.subarray(2 + len);
      const req = decodeIso8583(payload);
      // Auto-handle Network Management (init): 0800 → 0810 success.
      if (req.mti === '0800') {
        const respFields = {
          3: req.fields[3] || '990000',
          7: req.fields[7],
          11: req.fields[11],
          39: '00',
          41: req.fields[41] || '        ',
        };
        const respBuf = encodeIso8583('0810', respFields);
        const lenBuf = Buffer.alloc(2);
        lenBuf.writeUInt16BE(respBuf.length, 0);
        sock.write(Buffer.concat([lenBuf, respBuf]));
        return;
      }
      handler(req, sock);
    });
  });
}

test('JposDriver charge against mock terminal', async () => {
  // Mock terminal: accetta 0200 e risponde con 0210 RC=00.
  const server = mockJpos((req, sock) => {
    assert.equal(req.mti, '0200');
    const respFields = {
      3: req.fields[3],
      4: req.fields[4],
      7: req.fields[7],
      11: req.fields[11],
      37: req.fields[37],
      39: '00',
      41: req.fields[41],
      49: req.fields[49],
    };
    const respBuf = encodeIso8583('0210', respFields);
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16BE(respBuf.length, 0);
    sock.write(Buffer.concat([lenBuf, respBuf]));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const drv = new JposDriver({ host: '127.0.0.1', port, terminalId: 'POS00001', timeoutMs: 5_000 });
    const out = await drv.charge({ amount: 12.34, idempotencyKey: 'evt-test-1' });
    assert.equal(out.success, true);
    assert.equal(out.amount, 12.34);
    assert.equal(out.code, '00');
    assert.equal(out.driver, 'jpos');
    // Idempotency
    const out2 = await drv.charge({ amount: 12.34, idempotencyKey: 'evt-test-1' });
    assert.equal(out2.transactionId, out.transactionId);
  } finally {
    server.close();
  }
});

test('JposDriver charge declined on RC=04', async () => {
  const server = mockJpos((req, sock) => {
    const respFields = { ...req.fields, 39: '04' };
    const respBuf = encodeIso8583('0210', respFields);
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16BE(respBuf.length, 0);
    sock.write(Buffer.concat([lenBuf, respBuf]));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const drv = new JposDriver({ host: '127.0.0.1', port, timeoutMs: 5_000 });
    await assert.rejects(drv.charge({ amount: 5.00 }), /PAYMENT_DECLINED|rifiutato/);
  } finally {
    server.close();
  }
});
