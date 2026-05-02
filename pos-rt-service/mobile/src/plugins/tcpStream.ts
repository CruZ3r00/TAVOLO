/**
 * TcpStream — wrapper JS sopra plugin Capacitor `PosTcpStream`.
 *
 * Rispetto a `tcpSocket.sendOnce` (one-shot request/response), questo modulo
 * tiene una sessione TCP aperta su cui fare send/recv multipli, indispensabile
 * per protocolli con ACK separati e risposta differita post-input utente
 * (Protocollo 17 / Nexi ECR).
 *
 * Pattern d'uso: SEMPRE via `withSession()` per garantire close anche su throw.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

interface OpenResult {
  sessionId: number;
  localPort: number;
}

interface RecvResult {
  responseBase64: string;
  bytes: number;
  eof: boolean;
}

interface PosTcpStreamPlugin {
  open(opts: { host: string; port: number; timeoutMs?: number }): Promise<OpenResult>;
  send(opts: { sessionId: number; payloadBase64: string }): Promise<{ bytesWritten: number }>;
  recv(opts: {
    sessionId: number;
    timeoutMs: number;
    maxBytes?: number;
  }): Promise<RecvResult>;
  close(opts: { sessionId: number }): Promise<void>;
}

const Native = registerPlugin<PosTcpStreamPlugin>('PosTcpStream');

export function streamAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PosTcpStream');
}

function ensureAvailable(): void {
  if (!streamAvailable()) {
    throw new Error(
      'PosTcpStream plugin non disponibile. Build nativo Android richiesto (cap sync + cap run android).',
    );
  }
}

export interface TcpSession {
  readonly id: number;
  send(payload: Uint8Array): Promise<void>;
  /** Legge UNA volta fino a maxBytes (o al timeout). Ritorna [] se timeout. */
  recv(timeoutMs: number, maxBytes?: number): Promise<Uint8Array>;
  /** Legge esattamente N byte, riprovando fino a timeoutTotalMs. */
  recvExact(n: number, timeoutTotalMs: number): Promise<Uint8Array>;
  /**
   * Legge byte finché `untilByte` non compare nello stream, poi continua per
   * `tail` byte aggiuntivi. Es: per P17, `until=ETX, tail=1` legge il LRC.
   */
  recvUntil(untilByte: number, tail: number, timeoutTotalMs: number): Promise<Uint8Array>;
  close(): Promise<void>;
}

class TcpSessionImpl implements TcpSession {
  constructor(public readonly id: number) {}

  async send(payload: Uint8Array): Promise<void> {
    await Native.send({ sessionId: this.id, payloadBase64: uint8ToBase64(payload) });
  }

  async recv(timeoutMs: number, maxBytes: number = 65536): Promise<Uint8Array> {
    const r = await Native.recv({ sessionId: this.id, timeoutMs, maxBytes });
    return base64ToUint8(r.responseBase64);
  }

  async recvExact(n: number, timeoutTotalMs: number): Promise<Uint8Array> {
    const out = new Uint8Array(n);
    let received = 0;
    const start = Date.now();
    while (received < n) {
      const remaining = timeoutTotalMs - (Date.now() - start);
      if (remaining <= 0) {
        throw new Error(`tcpStream.recvExact: timeout dopo ${received}/${n} byte`);
      }
      const chunk = await this.recv(Math.max(50, Math.min(remaining, 5_000)), n - received);
      if (chunk.length === 0) continue;
      out.set(chunk, received);
      received += chunk.length;
    }
    return out;
  }

  async recvUntil(untilByte: number, tail: number, timeoutTotalMs: number): Promise<Uint8Array> {
    const collected: number[] = [];
    let foundAt = -1;
    const start = Date.now();
    while (true) {
      const remaining = timeoutTotalMs - (Date.now() - start);
      if (remaining <= 0) {
        throw new Error(`tcpStream.recvUntil: timeout senza incontrare 0x${untilByte.toString(16)}`);
      }
      const chunk = await this.recv(Math.max(50, Math.min(remaining, 5_000)));
      for (let i = 0; i < chunk.length; i++) {
        collected.push(chunk[i]);
        if (foundAt < 0 && chunk[i] === untilByte) {
          foundAt = collected.length - 1;
        }
      }
      if (foundAt >= 0 && collected.length >= foundAt + 1 + tail) break;
    }
    return new Uint8Array(collected.slice(0, foundAt + 1 + tail));
  }

  async close(): Promise<void> {
    try {
      await Native.close({ sessionId: this.id });
    } catch (_) {
      /* swallow: la sessione è chiusa lato server o già rimossa */
    }
  }
}

export async function openSession(
  host: string,
  port: number,
  timeoutMs: number = 15_000,
): Promise<TcpSession> {
  ensureAvailable();
  const r = await Native.open({ host, port, timeoutMs });
  return new TcpSessionImpl(r.sessionId);
}

/**
 * Helper d'uso: apre la sessione, esegue il body, chiude in finally.
 * Garantisce zero leak di socket anche in caso di throw.
 */
export async function withSession<T>(
  host: string,
  port: number,
  body: (s: TcpSession) => Promise<T>,
  options: { connectTimeoutMs?: number } = {},
): Promise<T> {
  const session = await openSession(host, port, options.connectTimeoutMs);
  try {
    return await body(session);
  } finally {
    await session.close();
  }
}

function uint8ToBase64(arr: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}
function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
