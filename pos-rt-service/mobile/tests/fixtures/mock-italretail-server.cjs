#!/usr/bin/env node
/**
 * Mock Italretail RT server (XON-XOFF over TCP).
 *
 * Risponde su porta 9100 (default) accettando frame `ESC % <op> <args> ETX`
 * — gli stessi che `customXon.ts` invia. Risponde con `<STX>RC=0|SCN=N</...><ETX>`.
 *
 * Use:
 *   node tests/fixtures/mock-italretail-server.js [port]
 *
 * Esegui senza dipendenze esterne (Node std lib).
 */

const net = require('net');
const port = Number(process.argv[2]) || 9100;

const STX = 0x02;
const ETX = 0x03;
const ESC = 0x1b;

let receiptNo = 1000;

const server = net.createServer((sock) => {
  console.log(`[italretail-mock] client connected from ${sock.remoteAddress}:${sock.remotePort}`);
  sock.setNoDelay(true);
  let buf = Buffer.alloc(0);

  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    // Cerca frame completi terminati da ETX (0x03)
    let endIdx;
    while ((endIdx = buf.indexOf(ETX)) >= 0) {
      const frame = buf.subarray(0, endIdx + 1);
      buf = buf.subarray(endIdx + 1);
      handleFrame(sock, frame);
    }
  });

  sock.on('end', () => console.log('[italretail-mock] client disconnected'));
  sock.on('error', (err) => console.warn('[italretail-mock] socket error:', err.message));
});

function handleFrame(sock, frame) {
  if (frame.length < 4 || frame[0] !== ESC || frame[1] !== 0x25) {
    return; // ignora frame malformati
  }
  const op = String.fromCharCode(frame[2]);
  const inner = frame.subarray(3, frame.length - 1).toString('latin1');
  console.log(`[italretail-mock] op="${op}" body="${inner}"`);

  let reply;
  switch (op) {
    case '?': // status
      reply = makeReply(`RC=0|STATUS=READY`);
      break;
    case '@': // begin operator
      reply = makeReply(`RC=0|OP=${inner}`);
      break;
    case '!': // print line
      reply = makeReply(`RC=0`);
      break;
    case '+': // total
      reply = makeReply(`RC=0`);
      break;
    case '#': // close fiscal receipt
      receiptNo++;
      reply = makeReply(`RC=0|SCN=${receiptNo}`);
      break;
    case '*': // non-fiscal print
      reply = makeReply(`RC=0`);
      break;
    default:
      reply = makeReply(`RC=99|MSG=unknown_op`);
  }
  sock.write(reply);
}

function makeReply(text) {
  const body = Buffer.from(text, 'latin1');
  const out = Buffer.alloc(body.length + 2);
  out[0] = STX;
  body.copy(out, 1);
  out[body.length + 1] = ETX;
  return out;
}

server.listen(port, () => {
  console.log(`[italretail-mock] in ascolto su tcp://0.0.0.0:${port}`);
});
