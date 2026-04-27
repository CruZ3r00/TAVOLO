/**
 * Custom XON driver mobile — Custom Q3X/Big/K3 via TCP, port da pos-rt-service Node.
 * Richiede plugin Capacitor `PosTcpSocket`.
 */

import { sendTcpOnce } from '../plugins/tcpSocket';
import { DriverError } from './types';
import type { DriverStatus, PrinterDriver, PrintOutcome, ReceiptInput } from './types';

const ESC = 0x1b;
const ETX = 0x03;
const STX = 0x02;

export interface CustomXonOptions {
  host: string;
  port?: number;
  timeoutMs?: number;
  operator?: string;
}

export class CustomXonDriverMobile implements PrinterDriver {
  readonly name = 'custom-xon';
  private opts: Required<CustomXonOptions>;
  private initialized = false;

  constructor(opts: CustomXonOptions) {
    this.opts = {
      port: 9100,
      timeoutMs: 30_000,
      operator: '1',
      ...opts,
    } as Required<CustomXonOptions>;
  }

  async init(): Promise<void> {
    if (!this.opts.host) throw new DriverError('DRIVER_UNAVAILABLE', 'custom-xon: host mancante');
    this.initialized = true;
  }

  async printReceipt(data: ReceiptInput): Promise<PrintOutcome> {
    if (!this.initialized) await this.init();
    const items = data.items || [];
    const lines = items
      .map((it) => `${(it.name || it.description || 'voce').slice(0, 38)}  ${it.quantity || 1}x ${Number(it.unit_price || it.price || 0).toFixed(2)}`)
      .join('\n');
    const text = (data.header || '') + '\n' + lines + '\n' + (data.total != null ? `TOTALE: ${Number(data.total).toFixed(2)} EUR\n` : '') + (data.footer || '');
    const cmd = this.frame('*', [text.slice(0, 1024)]);
    return this.exec(cmd, false);
  }

  async printFiscalReceipt(data: ReceiptInput): Promise<PrintOutcome> {
    if (!this.initialized) await this.init();
    const items = data.items || [];
    if (items.length === 0) {
      throw new DriverError('INVALID_PAYLOAD', 'custom-xon: scontrino senza voci');
    }
    const total = Math.round(Number(data.total || 0) * 100);
    const paymentType = data.payment_type ?? this.mapPaymentType(data.payment_method);
    const parts: Uint8Array[] = [];
    parts.push(this.frame('@', [this.opts.operator]));
    for (const it of items) {
      const desc = (it.name || it.description || 'voce').slice(0, 38);
      const price = Math.round(Number(it.unit_price || it.price || 0) * 100);
      const qty = it.quantity || 1;
      const dept = String(it.vatGroup || it.department || '1');
      parts.push(this.frame('!', [desc, String(price), String(qty), dept]));
    }
    parts.push(this.frame('+', [String(paymentType), String(total)]));
    parts.push(this.frame('#', []));
    const big = concat(parts);
    return this.exec(big, true);
  }

  async getStatus(): Promise<DriverStatus> {
    try {
      const resp = await sendTcpOnce(this.opts.host, this.opts.port, this.frame('?', []), { timeoutMs: 3_000, quietMs: 200 });
      const ok = resp.length > 0 && resp[0] === STX;
      return { online: ok, name: this.name, host: this.opts.host };
    } catch (err: any) {
      return { online: false, name: this.name, host: this.opts.host, error: err.message };
    }
  }

  async dispose(): Promise<void> {
    /* noop */
  }

  private mapPaymentType(method?: string): number {
    if (!method) return 1;
    const m = method.toLowerCase();
    if (m === 'cash' || m === 'contanti') return 1;
    if (m === 'card' || m === 'pos' || m === 'credit_card') return 2;
    if (m === 'meal_voucher' || m === 'ticket') return 4;
    return 5;
  }

  private frame(opcode: string, args: string[]): Uint8Array {
    const body = args.join('|');
    const enc = new TextEncoder();
    const op = enc.encode(opcode);
    const bb = enc.encode(body);
    const out = new Uint8Array(2 + op.length + bb.length + 1);
    out[0] = ESC;
    out[1] = 0x25; // '%'
    out.set(op, 2);
    out.set(bb, 2 + op.length);
    out[out.length - 1] = ETX;
    return out;
  }

  private async exec(payload: Uint8Array, fiscal: boolean): Promise<PrintOutcome> {
    const resp = await sendTcpOnce(this.opts.host, this.opts.port, payload, {
      timeoutMs: this.opts.timeoutMs,
      quietMs: 200,
    });
    const text = new TextDecoder('latin1').decode(resp);
    const m = text.match(/RC=(\d+)/);
    if (m && m[1] !== '0') {
      throw new DriverError('DRIVER_ERROR', `custom-xon: RC=${m[1]}`);
    }
    const noMatch = text.match(/SCN=(\d+)/);
    return {
      success: true,
      receipt_no: noMatch ? noMatch[1] : `CX-${Date.now()}`,
      fiscal,
      timestamp: new Date().toISOString(),
      driver: this.name,
    };
  }
}

function concat(arrs: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const a of arrs) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}
