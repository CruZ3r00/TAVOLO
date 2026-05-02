/**
 * Integration test: il wire P17 prodotto dai nostri helper viene compreso dal
 * mock Nexi (e viceversa). Spawn del mock come child process, apertura TCP
 * con `net`, invio di un frame con `wrapStxEtxLrc`, verifica di ACK + response
 * + LRC con `unwrapStxEtxLrc`.
 *
 * NB: NON usa il plugin Capacitor `PosTcpStream` (non disponibile in Node).
 * Il test verifica l'**interoperabilità wire**: se passa, vuol dire che gli
 * helper sono allineati col mock e con la spec ECR17.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import {
  ACK,
  ETX,
  STX,
  ackPacket,
  unwrapStxEtxLrc,
  wrapStxEtxLrc,
} from '../../src/drivers/helpers/frame';

const PORT = 19_999;
let mock: ChildProcess;

function startMock(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, '..', 'fixtures', 'mock-nexi-p17-server.cjs');
    mock = spawn('node', [script, String(PORT), '--pin-delay=200'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let ok = false;
    const t = setTimeout(() => {
      if (!ok) reject(new Error('mock did not start within 3s'));
    }, 3_000);
    mock.stdout?.on('data', (chunk) => {
      const s = chunk.toString();
      if (s.includes('in ascolto')) {
        ok = true;
        clearTimeout(t);
        resolve();
      }
    });
    mock.stderr?.on('data', (c) => { /* keep silent unless debugging */ });
    mock.on('error', reject);
  });
}

function stopMock(): Promise<void> {
  return new Promise((resolve) => {
    if (!mock || mock.killed) return resolve();
    mock.once('exit', () => resolve());
    mock.kill('SIGTERM');
    setTimeout(() => mock?.kill('SIGKILL'), 1_000);
  });
}

interface Outcome {
  ackByte: number;
  responseBody: string;
  lrcOk: boolean;
}

function exchange(payload: Uint8Array): Promise<Outcome> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(PORT, '127.0.0.1');
    let buf = Buffer.alloc(0);
    let phase: 'ack' | 'response' = 'ack';
    let ackByte = 0;
    const tmo = setTimeout(() => {
      sock.destroy();
      reject(new Error('exchange timeout'));
    }, 8_000);

    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (phase === 'ack' && buf.length >= 3) {
        ackByte = buf[0];
        buf = buf.subarray(3);
        phase = 'response';
      }
      if (phase === 'response') {
        const etx = buf.indexOf(ETX);
        if (etx >= 0 && etx + 1 < buf.length) {
          const frame = buf.subarray(0, etx + 2);
          try {
            const { payload } = unwrapStxEtxLrc(new Uint8Array(frame));
            // ACK al terminale (mock non se ne cura ma rispettiamo il protocollo)
            sock.write(Buffer.from(ackPacket()));
            clearTimeout(tmo);
            sock.end();
            resolve({
              ackByte,
              responseBody: new TextDecoder('latin1').decode(payload),
              lrcOk: true,
            });
          } catch (err: any) {
            clearTimeout(tmo);
            sock.destroy();
            resolve({ ackByte, responseBody: '', lrcOk: false });
          }
        }
      }
    });
    sock.on('error', reject);

    sock.write(Buffer.from(payload));
  });
}

describe('Nexi P17 wire interoperability (vs mock)', () => {
  beforeAll(async () => { await startMock(); });
  afterAll(async () => { await stopMock(); });

  it('PAY: invia frame, riceve ACK + response RC=00 con TXN', async () => {
    const body = new TextEncoder().encode('OP=PAY|TID=TID00001|WID=POS01|AMT=1500|CUR=978|REF=test1');
    const out = await exchange(wrapStxEtxLrc(body));
    expect(out.ackByte).toBe(ACK);
    expect(out.lrcOk).toBe(true);
    expect(out.responseBody).toMatch(/^RC=00\b/);
    expect(out.responseBody).toMatch(/TXN=TX\d+/);
  });

  it('STAT: il terminale è online', async () => {
    const body = new TextEncoder().encode('OP=STAT|TID=TID00001|WID=POS01');
    const out = await exchange(wrapStxEtxLrc(body));
    expect(out.ackByte).toBe(ACK);
    expect(out.lrcOk).toBe(true);
    expect(out.responseBody).toMatch(/RC=00/);
  });

  it('INQ su REF inesistente: il mock risponde RC=13 NOT_FOUND', async () => {
    const body = new TextEncoder().encode('OP=INQ|TID=TID00001|WID=POS01|REF=does-not-exist');
    const out = await exchange(wrapStxEtxLrc(body));
    expect(out.ackByte).toBe(ACK);
    expect(out.lrcOk).toBe(true);
    expect(out.responseBody).toMatch(/RC=13/);
    expect(out.responseBody).toMatch(/STATUS=NOT_FOUND/);
  });

  it('Idempotency replay scenario: PAY + INQ stessa REF → la transazione è recuperabile', async () => {
    const ref = `replay-${Date.now()}`;
    const pay = new TextEncoder().encode(`OP=PAY|TID=TID00001|WID=POS01|AMT=200|CUR=978|REF=${ref}`);
    const out1 = await exchange(wrapStxEtxLrc(pay));
    expect(out1.responseBody).toMatch(/RC=00/);
    const txnMatch = out1.responseBody.match(/TXN=([A-Z0-9]+)/);
    expect(txnMatch).not.toBeNull();

    // Replay: simula app killed dopo PAY → restart fa Inquiry sulla stessa REF
    const inq = new TextEncoder().encode(`OP=INQ|TID=TID00001|WID=POS01|REF=${ref}`);
    const out2 = await exchange(wrapStxEtxLrc(inq));
    expect(out2.responseBody).toMatch(/RC=00/);
    expect(out2.responseBody).toMatch(/MSG=FOUND/);
    expect(out2.responseBody).toContain(`TXN=${txnMatch![1]}`);
  });
});

// Sanity check sul costanti (paranoia: riallineiamoci a STX se qualcosa cambia upstream)
describe('frame constants', () => {
  it('STX/ETX/ACK ben definiti', () => {
    expect(STX).toBe(0x02);
    expect(ETX).toBe(0x03);
    expect(ACK).toBe(0x06);
  });
});
