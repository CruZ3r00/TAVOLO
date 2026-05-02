/**
 * ESC/POS-fiscal generic driver mobile — fallback per RT con dialetto
 * ESC/POS esteso. Port da pos-rt-service Node. Richiede plugin Capacitor
 * `PosTcpSocket`.
 */

import { sendTcpOnce } from '../plugins/tcpSocket';
import { DriverError } from './types';
import type { DriverStatus, PrinterDriver, PrintOutcome, ReceiptInput } from './types';
import { concatBytes } from './helpers/frame';
import { mapPrinterPaymentType } from './helpers/payTypeMap';

const ESC = 0x1b;
const ETB = 0x17;
const LF = 0x0a;

export interface EscposFiscalOptions {
  host: string;
  port?: number;
  timeoutMs?: number;
  operator?: string;
}

export class EscposFiscalDriverMobile implements PrinterDriver {
  readonly name = 'escpos-fiscal';
  private opts: Required<EscposFiscalOptions>;
  private initialized = false;

  constructor(opts: EscposFiscalOptions) {
    this.opts = {
      port: 9100,
      timeoutMs: 30_000,
      operator: '1',
      ...opts,
    } as Required<EscposFiscalOptions>;
  }

  async init(): Promise<void> {
    if (!this.opts.host) throw new DriverError('DRIVER_UNAVAILABLE', 'escpos-fiscal: host mancante');
    this.initialized = true;
  }

  async printReceipt(data: ReceiptInput): Promise<PrintOutcome> {
    if (!this.initialized) await this.init();
    const lines = (data.items || []).map((it) =>
      `${(it.name || it.description || 'voce').slice(0, 38)}  ${it.quantity || 1}x ${Number(it.unit_price || it.price || 0).toFixed(2)}`,
    );
    if (data.total != null) lines.push(`TOTALE: ${Number(data.total).toFixed(2)} EUR`);
    const text = lines.join('\n');
    return this.exec([this.cmd('N', [text.slice(0, 1024)])], false);
  }

  async printFiscalReceipt(data: ReceiptInput): Promise<PrintOutcome> {
    if (!this.initialized) await this.init();
    const items = data.items || [];
    if (items.length === 0) {
      throw new DriverError('INVALID_PAYLOAD', 'escpos-fiscal: scontrino senza voci');
    }
    const cmds: Uint8Array[] = [];
    cmds.push(this.cmd('A', [this.opts.operator]));
    for (const it of items) {
      const desc = (it.name || it.description || 'voce').slice(0, 38);
      const cents = Math.round(Number(it.unit_price || it.price || 0) * 100);
      const qty = it.quantity || 1;
      const dept = String(it.vatGroup || it.department || '1');
      cmds.push(this.cmd('I', [desc, String(cents), String(qty), dept]));
    }
    const totalCents = Math.round(Number(data.total || 0) * 100);
    const payType = data.payment_type ?? mapPrinterPaymentType(data.payment_method, 'escpos-fiscal');
    cmds.push(this.cmd('T', [String(totalCents), String(payType)]));
    cmds.push(this.cmd('C', []));
    return this.exec(cmds, true);
  }

  async getStatus(): Promise<DriverStatus> {
    try {
      const resp = await sendTcpOnce(this.opts.host, this.opts.port, this.cmd('S', []), {
        timeoutMs: 3_000,
        quietMs: 200,
      });
      const ok = resp.length > 0 && resp[0] !== 0x15;
      return { online: ok, name: this.name, host: this.opts.host };
    } catch (err: any) {
      return { online: false, name: this.name, host: this.opts.host, error: err.message };
    }
  }

  async dispose(): Promise<void> {
    /* noop */
  }

  private cmd(opcode: string, args: string[]): Uint8Array {
    const enc = new TextEncoder();
    const opBuf = enc.encode(opcode);
    const argParts: Uint8Array[] = [];
    args.forEach((a, i) => {
      if (i > 0) argParts.push(new Uint8Array([ETB]));
      argParts.push(enc.encode(String(a)));
    });
    const argsBuf = concatBytes(argParts);
    const out = new Uint8Array(2 + opBuf.length + argsBuf.length + 1);
    out[0] = ESC;
    out[1] = 0x7c;
    out.set(opBuf, 2);
    out.set(argsBuf, 2 + opBuf.length);
    out[out.length - 1] = LF;
    return out;
  }

  private async exec(cmds: Uint8Array[], fiscal: boolean): Promise<PrintOutcome> {
    const buf = await sendTcpOnce(this.opts.host, this.opts.port, concatBytes(cmds), {
      timeoutMs: this.opts.timeoutMs,
      quietMs: 200,
    });
    const text = new TextDecoder('utf-8').decode(buf);
    if (buf.length > 0 && buf[0] === 0x15) {
      const code = (text.match(/E(\d+)/) || [])[1] || '99';
      throw new DriverError('DRIVER_ERROR', `escpos-fiscal: NAK code=${code}`);
    }
    const noMatch = text.match(/N(\d+)/) || text.match(/RCN=(\d+)/);
    return {
      success: true,
      receipt_no: noMatch ? noMatch[1] : `EF-${Date.now()}`,
      fiscal,
      timestamp: new Date().toISOString(),
      driver: this.name,
    };
  }
}
