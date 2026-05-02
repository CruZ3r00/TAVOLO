#!/usr/bin/env node
/**
 * Mock Nexi POS server (Protocollo 17 / ECR17).
 *
 * Implementa lo handshake P17:
 *   1. Riceve `STX | msg | ETX | LRC` dall'ECR
 *   2. Risponde immediatamente con ACK (0x06 0x03 0x7A)
 *   3. Attende un breve ritardo (`pinDelayMs`, default 1500ms = simulazione PIN entry)
 *   4. Invia `STX | response | ETX | LRC` con esito (RC=00)
 *   5. Riceve ACK dall'ECR
 *
 * Logica messaggi (encoder pipe-delimited):
 *   - OP=PAY  → autorizzato (RC=00) con TXN crescente. Salvato in memoria per Inquiry.
 *   - OP=INQ  → ritorna l'ultima TXN PAY se REF coincide, altrimenti RC=13 (NOT_FOUND).
 *   - OP=REF  → autorizza il refund (RC=00).
 *   - OP=STAT → ritorna RC=00 (terminale online).
 *
 * Use:
 *   node tests/fixtures/mock-nexi-p17-server.js [port] [--decline-rate=0.0]
 */

const net = require('net');
const args = process.argv.slice(2);
const port = Number(args.find((a) => /^\d+$/.test(a))) || 9999;
const declineRate = Number((args.find((a) => /^--decline-rate=/.test(a)) || '').split('=')[1]) || 0;
const pinDelayMs = Number((args.find((a) => /^--pin-delay=/.test(a)) || '').split('=')[1]) || 1500;

const STX = 0x02;
const ETX = 0x03;
const ACK = 0x06;
const NAK = 0x15;

let txnCounter = 1000;
const txnByRef = new Map();

const server = net.createServer((sock) => {
  console.log(`[nexi-p17-mock] client connected from ${sock.remoteAddress}:${sock.remotePort}`);
  sock.setNoDelay(true);
  let buf = Buffer.alloc(0);

  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    let etxIdx;
    while ((etxIdx = buf.indexOf(ETX)) >= 0 && etxIdx + 1 < buf.length) {
      // Frame = STX..msg..ETX LRC (etxIdx+1 byte è il LRC)
      const frame = buf.subarray(0, etxIdx + 2);
      if (frame.length < 4 || frame[0] !== STX) {
        // Forse è un ACK isolato (3 byte). Scartiamo.
        if (frame[0] === ACK || frame[0] === NAK) {
          buf = buf.subarray(3);
          continue;
        }
        buf = buf.subarray(1);
        continue;
      }
      buf = buf.subarray(etxIdx + 2);
      handleFrame(sock, frame);
    }
  });

  sock.on('end', () => console.log('[nexi-p17-mock] client disconnected'));
  sock.on('error', (err) => console.warn('[nexi-p17-mock] socket error:', err.message));
});

function handleFrame(sock, frame) {
  const expectedLrc = lrc(frame.subarray(1, frame.length - 1));
  const got = frame[frame.length - 1];
  if (expectedLrc !== got) {
    console.warn(`[nexi-p17-mock] LRC mismatch (atteso 0x${expectedLrc.toString(16)}, ricevuto 0x${got.toString(16)}) → NAK`);
    return sock.write(makeAckNak(NAK));
  }

  const body = frame.subarray(1, frame.length - 2).toString('latin1');
  const fields = parseFields(body);
  console.log(`[nexi-p17-mock] frame ricevuto:`, fields);

  // 1) ACK immediato
  sock.write(makeAckNak(ACK));

  // 2) Risposta differita
  setTimeout(() => {
    const reply = buildReply(fields);
    const wrapped = wrapStxEtxLrc(Buffer.from(reply, 'latin1'));
    sock.write(wrapped);
    console.log(`[nexi-p17-mock] response: ${reply}`);
  }, fields.OP === 'STAT' ? 50 : pinDelayMs);
}

function buildReply(fields) {
  const op = (fields.OP || '').toUpperCase();
  if (op === 'PAY') {
    if (Math.random() < declineRate) {
      return `RC=04|MSG=DECLINED|REF=${esc(fields.REF || '-')}`;
    }
    txnCounter++;
    const txn = `TX${txnCounter}`;
    txnByRef.set(fields.REF || '-', { txn, amt: fields.AMT, ts: Date.now() });
    return `RC=00|TXN=${txn}|AUTH=A${txnCounter}|REF=${esc(fields.REF || '-')}|MSG=OK`;
  }
  if (op === 'INQ') {
    const found = txnByRef.get(fields.REF || '');
    if (found) return `RC=00|TXN=${found.txn}|AMT=${found.amt}|REF=${esc(fields.REF)}|MSG=FOUND`;
    return `RC=13|STATUS=NOT_FOUND|REF=${esc(fields.REF || '-')}|MSG=transazione_non_trovata`;
  }
  if (op === 'REF') {
    txnCounter++;
    return `RC=00|TXN=R${txnCounter}|REF=${esc(fields.REF || '-')}|MSG=REFUND_OK`;
  }
  if (op === 'STAT') {
    return `RC=00|MSG=ONLINE|VER=mock-1.0`;
  }
  return `RC=99|MSG=op_sconosciuta`;
}

function parseFields(body) {
  const out = {};
  for (const part of body.split('|')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    out[part.slice(0, eq).trim().toUpperCase()] = part.slice(eq + 1);
  }
  return out;
}

function lrc(bytes, base = 0x7f) {
  let acc = base & 0xff;
  for (const b of bytes) acc ^= b & 0xff;
  return acc & 0xff;
}

function wrapStxEtxLrc(payload) {
  const out = Buffer.alloc(payload.length + 3);
  out[0] = STX;
  payload.copy(out, 1);
  out[payload.length + 1] = ETX;
  out[payload.length + 2] = lrc(out.subarray(1, payload.length + 2));
  return out;
}

function makeAckNak(byte) {
  const out = Buffer.alloc(3);
  out[0] = byte;
  out[1] = ETX;
  out[2] = lrc(Buffer.from([byte, ETX]));
  return out;
}

function esc(s) {
  return String(s ?? '').replace(/[|\r\n\x00-\x1f]/g, '_');
}

server.listen(port, () => {
  console.log(`[nexi-p17-mock] in ascolto su tcp://0.0.0.0:${port} (declineRate=${declineRate}, pinDelay=${pinDelayMs}ms)`);
});
