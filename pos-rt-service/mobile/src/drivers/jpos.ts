/**
 * JPOS driver mobile — ISO-8583 lite over TCP. Port da pos-rt-service Node.
 * Richiede plugin Capacitor `PosTcpSocket`.
 */

import { sendTcpOnce } from '../plugins/tcpSocket';
import { DriverError } from './types';
import type {
  ChargeInput,
  ChargeOutcome,
  DriverStatus,
  PaymentDriver,
  RefundInput,
  RefundOutcome,
} from './types';

export interface JposOptions {
  host: string;
  port?: number;
  terminalId?: string;
  currency?: string;
  timeoutMs?: number;
}

const FIELD_FORMATS: Record<number, { len: number }> = {
  3: { len: 6 },
  4: { len: 12 },
  7: { len: 10 },
  11: { len: 6 },
  12: { len: 6 },
  13: { len: 4 },
  37: { len: 12 },
  39: { len: 2 },
  41: { len: 8 },
  49: { len: 3 },
};

export class JposDriverMobile implements PaymentDriver {
  readonly name = 'jpos';
  private opts: Required<JposOptions>;
  private cache = new Map<string, ChargeOutcome>();
  private stan: number;
  private initialized = false;

  constructor(opts: JposOptions) {
    this.opts = {
      port: 9000,
      terminalId: 'POS00001',
      currency: '978',
      timeoutMs: 30_000,
      ...opts,
    } as Required<JposOptions>;
    this.stan = Math.floor(Math.random() * 999_999);
  }

  async init(): Promise<void> {
    if (!this.opts.host) throw new DriverError('DRIVER_UNAVAILABLE', 'jpos: host mancante');
    this.initialized = true;
  }

  async charge(input: ChargeInput): Promise<ChargeOutcome> {
    if (!this.initialized) await this.init();
    if (input.idempotencyKey && this.cache.has(input.idempotencyKey)) {
      return this.cache.get(input.idempotencyKey)!;
    }
    const minor = Math.round(input.amount * 100);
    const stan = this.nextStan();
    const ref = (input.orderRef || input.idempotencyKey || stan).slice(0, 12).padEnd(12, ' ');
    const fields = {
      3: '000000',
      4: String(minor).padStart(12, '0'),
      7: this.transmissionDt(),
      11: stan,
      37: ref,
      41: this.opts.terminalId.padEnd(8, ' ').slice(0, 8),
      49: this.opts.currency.padStart(3, '0'),
    };
    const reqBuf = encodeIso8583('0200', fields);
    const respBuf = await sendTcpOnce(this.opts.host, this.opts.port, frameWithLen(reqBuf), {
      timeoutMs: this.opts.timeoutMs,
    });
    const resp = decodeIso8583(unframeWithLen(respBuf));
    if (resp.mti !== '0210') {
      throw new DriverError('DRIVER_ERROR', `jpos: MTI risposta inatteso ${resp.mti}`);
    }
    const rc = resp.fields[39] || '99';
    const success = rc === '00';
    const outcome: ChargeOutcome = {
      success,
      transactionId: (resp.fields[37] || ref).trim() || `JPOS-${stan}`,
      amount: minor / 100,
      currency: input.currency || 'EUR',
      orderRef: input.orderRef || null,
      timestamp: new Date().toISOString(),
      driver: this.name,
      code: rc,
      message: success ? 'OK' : `Response code ${rc}`,
    };
    if (!success) {
      throw new DriverError(
        rc === '01' || rc === '04' ? 'PAYMENT_DECLINED' : 'DRIVER_ERROR',
        `jpos: rifiutato (${rc})`,
        outcome,
      );
    }
    if (input.idempotencyKey) this.cache.set(input.idempotencyKey, outcome);
    return outcome;
  }

  async refund(input: RefundInput): Promise<RefundOutcome> {
    if (!this.initialized) await this.init();
    const minor = Math.round(input.amount * 100);
    const stan = this.nextStan();
    const ref = String(input.transactionId || stan).slice(0, 12).padEnd(12, ' ');
    const fields = {
      3: '200000',
      4: String(minor).padStart(12, '0'),
      7: this.transmissionDt(),
      11: stan,
      37: ref,
      41: this.opts.terminalId.padEnd(8, ' ').slice(0, 8),
      49: this.opts.currency.padStart(3, '0'),
    };
    const respBuf = await sendTcpOnce(this.opts.host, this.opts.port, frameWithLen(encodeIso8583('0220', fields)), {
      timeoutMs: this.opts.timeoutMs,
    });
    const resp = decodeIso8583(unframeWithLen(respBuf));
    const rc = resp.fields[39] || '99';
    if (resp.mti !== '0230' || rc !== '00') {
      throw new DriverError('DRIVER_ERROR', `jpos refund: rc=${rc}`);
    }
    return {
      success: true,
      refundId: (resp.fields[37] || ref).trim() || `JPOS-R-${stan}`,
      transactionId: input.transactionId,
      amount: input.amount,
      timestamp: new Date().toISOString(),
      driver: this.name,
    };
  }

  async getStatus(): Promise<DriverStatus> {
    try {
      const stan = this.nextStan();
      const fields = {
        3: '990000',
        7: this.transmissionDt(),
        11: stan,
        41: this.opts.terminalId.padEnd(8, ' ').slice(0, 8),
      };
      const respBuf = await sendTcpOnce(this.opts.host, this.opts.port, frameWithLen(encodeIso8583('0800', fields)), {
        timeoutMs: 5_000,
      });
      const resp = decodeIso8583(unframeWithLen(respBuf));
      return { online: resp.mti === '0810', name: this.name, host: this.opts.host };
    } catch (err: any) {
      return { online: false, name: this.name, host: this.opts.host, error: err.message };
    }
  }

  async dispose(): Promise<void> {
    this.cache.clear();
  }

  private nextStan(): string {
    this.stan = (this.stan + 1) % 1_000_000;
    return String(this.stan).padStart(6, '0');
  }

  private transmissionDt(): string {
    const d = new Date();
    const pad = (n: number, w: number) => String(n).padStart(w, '0');
    return (
      pad(d.getMonth() + 1, 2) +
      pad(d.getDate(), 2) +
      pad(d.getHours(), 2) +
      pad(d.getMinutes(), 2) +
      pad(d.getSeconds(), 2)
    );
  }
}

function encodeIso8583(mti: string, fields: Record<number, string>): Uint8Array {
  if (!/^\d{4}$/.test(mti)) throw new DriverError('INVALID_PAYLOAD', `MTI invalido: ${mti}`);
  const present = Object.keys(fields).map(Number).filter((n) => n >= 1 && n <= 64).sort((a, b) => a - b);
  const bits = new Uint8Array(8);
  for (const n of present) {
    const byte = Math.floor((n - 1) / 8);
    const bit = 7 - ((n - 1) % 8);
    bits[byte] |= 1 << bit;
  }
  let bitmapHex = '';
  for (const b of bits) bitmapHex += b.toString(16).padStart(2, '0').toUpperCase();
  let payload = mti + bitmapHex;
  for (const n of present) {
    const fmt = FIELD_FORMATS[n];
    const v = String(fields[n]);
    if (!fmt) throw new DriverError('INVALID_PAYLOAD', `ISO-8583 F${n} non supportato`);
    if (v.length !== fmt.len) {
      throw new DriverError('INVALID_PAYLOAD', `F${n}: lunghezza ${v.length}, attesa ${fmt.len}`);
    }
    payload += v;
  }
  return new TextEncoder().encode(payload);
}

function decodeIso8583(buf: Uint8Array): { mti: string; fields: Record<number, string> } {
  const text = new TextDecoder('latin1').decode(buf);
  if (text.length < 20) throw new DriverError('DRIVER_ERROR', 'ISO-8583: payload troppo corto');
  const mti = text.slice(0, 4);
  const bitmapHex = text.slice(4, 20);
  const bits = new Uint8Array(8);
  for (let i = 0; i < 8; i++) bits[i] = parseInt(bitmapHex.substr(i * 2, 2), 16);
  let cursor = 20;
  const fields: Record<number, string> = {};
  for (let n = 1; n <= 64; n++) {
    const byte = Math.floor((n - 1) / 8);
    const bit = 7 - ((n - 1) % 8);
    if (!(bits[byte] & (1 << bit))) continue;
    if (n === 1) continue;
    const fmt = FIELD_FORMATS[n];
    if (!fmt) throw new DriverError('DRIVER_ERROR', `F${n} non implementato in decoder`);
    fields[n] = text.slice(cursor, cursor + fmt.len);
    cursor += fmt.len;
  }
  return { mti, fields };
}

function frameWithLen(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(2 + payload.length);
  out[0] = (payload.length >> 8) & 0xff;
  out[1] = payload.length & 0xff;
  out.set(payload, 2);
  return out;
}

function unframeWithLen(buf: Uint8Array): Uint8Array {
  if (buf.length < 2) throw new DriverError('DRIVER_ERROR', 'jpos: framing risposta corrotto');
  const len = (buf[0] << 8) | buf[1];
  return buf.subarray(2, 2 + len);
}
