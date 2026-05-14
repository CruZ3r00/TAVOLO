/**
 * ESC/POS network printer driver.
 *
 * Target: stampanti comande Epson TM e compatibili su LAN/WiFi, raw TCP 9100.
 */

import { sendTcpOnce } from '../plugins/tcpSocket';
import { DriverError } from './types';
import type {
  DriverStatus,
  KitchenTicketInput,
  PrintOutcome,
  PrinterDriver,
  ReceiptInput,
} from './types';
import { concatBytes } from './helpers/frame';

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

interface StationTarget {
  host?: string;
  port?: number;
}

export interface EscposNetworkOptions {
  host?: string;
  port?: number;
  timeoutMs?: number;
  width?: number;
  stations?: Record<string, StationTarget>;
}

export class EscposNetworkDriverMobile implements PrinterDriver {
  readonly name = 'escpos-network';
  private opts: Required<Omit<EscposNetworkOptions, 'stations'>> & { stations: Record<string, StationTarget> };
  private initialized = false;

  constructor(opts: EscposNetworkOptions = {}) {
    this.opts = {
      host: opts.host || '',
      port: opts.port || 9100,
      timeoutMs: opts.timeoutMs || 10_000,
      width: opts.width || 42,
      stations: opts.stations || {},
    };
  }

  async init(): Promise<void> {
    const hasDefault = !!this.opts.host;
    const hasStation = Object.values(this.opts.stations || {}).some((station) => !!station?.host);
    if (!hasDefault && !hasStation) {
      throw new DriverError('DRIVER_UNAVAILABLE', 'escpos-network: configura almeno un IP stampante');
    }
    this.initialized = true;
  }

  async printReceipt(data: ReceiptInput): Promise<PrintOutcome> {
    if (!this.initialized) await this.init();
    const lines: string[] = [];
    if (data.header) lines.push(...wrap(String(data.header), this.opts.width));
    for (const item of data.items || []) {
      const qty = Number(item.quantity || 1);
      const name = item.name || item.description || 'Voce';
      lines.push(`${qty}x ${name}`);
    }
    if (data.total != null) {
      lines.push(rule(this.opts.width));
      lines.push(`TOTALE ${Number(data.total || 0).toFixed(2)} EUR`);
    }
    if (data.footer) lines.push(...wrap(String(data.footer), this.opts.width));
    return this.sendTicket({ title: 'RICEVUTA', items: [], action: 'reprint' }, lines);
  }

  async printFiscalReceipt(data: ReceiptInput): Promise<PrintOutcome> {
    return this.printReceipt(data);
  }

  async printKitchenTicket(data: KitchenTicketInput): Promise<PrintOutcome> {
    if (!this.initialized) await this.init();
    const station = normalizeStation(data.station);
    const action = normalizeAction(data.action);
    const title = data.title || titleFor(action, station);
    const lines: string[] = [];

    lines.push(new Date(data.printed_at || Date.now()).toLocaleString('it-IT'));
    if (data.table?.number != null) {
      lines.push(`TAVOLO ${data.table.number}${data.table.area ? ` - ${data.table.area}` : ''}`);
    } else if (data.takeaway) {
      lines.push(`ASPORTO${data.takeaway.customer_name ? ` - ${data.takeaway.customer_name}` : ''}`);
      if (data.takeaway.pickup_at) lines.push(`Ritiro: ${formatTime(data.takeaway.pickup_at)}`);
    }
    lines.push(rule(this.opts.width));

    const grouped = groupByCourse(data.items || []);
    for (const [course, items] of grouped) {
      if (course) lines.push(`PORTATA ${course}`);
      for (const item of items) {
        const qty = Number(item.quantity || 1);
        const prefix = action === 'cancel' ? 'ANNULLA ' : action === 'update' ? 'MODIFICA ' : '';
        lines.push(...wrap(`${prefix}${qty}x ${item.name || 'Voce'}`, this.opts.width));
        if (item.notes) {
          lines.push(...wrap(`  note: ${item.notes}`, this.opts.width));
        }
      }
    }
    lines.push(rule(this.opts.width));
    lines.push((station || 'cucina').toUpperCase());

    return this.sendTicket(data, lines, title);
  }

  async getStatus(): Promise<DriverStatus> {
    const firstStation = Object.values(this.opts.stations || {}).find((station) => !!station?.host);
    const target = this.opts.host
      ? this.resolveTarget(null)
      : { host: firstStation?.host || '', port: Number(firstStation?.port || 9100) };
    if (!target.host) {
      return { online: false, name: this.name, error: 'Nessun IP stampante configurato' };
    }
    try {
      await sendTcpOnce(target.host, target.port, new Uint8Array([ESC, 0x40]), {
        timeoutMs: 2_000,
        quietMs: 80,
      });
      return { online: true, name: this.name, host: target.host, port: target.port };
    } catch (err: any) {
      return { online: false, name: this.name, host: target.host, port: target.port, error: err.message };
    }
  }

  async dispose(): Promise<void> {
    /* noop */
  }

  private async sendTicket(
    data: KitchenTicketInput,
    lines: string[],
    title: string = 'COMANDA',
  ): Promise<PrintOutcome> {
    const target = this.resolveTarget(data.station);
    if (!target.host) {
      throw new DriverError('DRIVER_UNAVAILABLE', `escpos-network: IP mancante per ${data.station || 'default'}`);
    }
    const payload = concatBytes([
      bytes([ESC, 0x40]),
      bytes([ESC, 0x61, 0x01]),
      bytes([ESC, 0x45, 0x01]),
      bytes([GS, 0x21, 0x11]),
      text(`${title}\n`),
      bytes([GS, 0x21, 0x00]),
      bytes([ESC, 0x45, 0x00]),
      bytes([ESC, 0x61, 0x00]),
      text(lines.join('\n')),
      text('\n\n\n'),
      bytes([GS, 0x56, 0x00]),
    ]);
    await sendTcpOnce(target.host, target.port, payload, {
      timeoutMs: this.opts.timeoutMs,
      quietMs: 120,
    });
    return {
      success: true,
      receipt_no: `KT-${Date.now()}`,
      fiscal: false,
      timestamp: new Date().toISOString(),
      driver: this.name,
    };
  }

  private resolveTarget(station?: string | null): Required<StationTarget> {
    const key = normalizeStation(station);
    const stationTarget = key ? this.opts.stations[key] : null;
    return {
      host: stationTarget?.host || this.opts.host,
      port: Number(stationTarget?.port || this.opts.port || 9100),
    };
  }
}

function bytes(values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(sanitize(value));
}

function sanitize(value: string): string {
  return String(value || '')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/[^\x09\x0a\x0d\x20-\x7eÀ-ÿ]/g, '');
}

function rule(width: number): string {
  return '-'.repeat(Math.max(24, Math.min(width, 48)));
}

function wrap(value: string, width: number): string[] {
  const max = Math.max(24, Math.min(width, 48));
  const words = sanitize(value).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const word of words) {
    if (!line) {
      line = word;
    } else if ((line + ' ' + word).length <= max) {
      line += ' ' + word;
    } else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

function normalizeStation(value?: string | null): string | null {
  const station = String(value || '').trim().toLowerCase();
  return station || null;
}

function normalizeAction(value?: string): string {
  const action = String(value || 'add').toLowerCase();
  return ['add', 'update', 'cancel', 'reprint'].includes(action) ? action : 'add';
}

function titleFor(action: string, station: string | null): string {
  const suffix = station ? ` ${station.toUpperCase()}` : '';
  if (action === 'cancel') return `ANNULLA${suffix}`;
  if (action === 'update') return `MODIFICA${suffix}`;
  if (action === 'reprint') return `RISTAMPA${suffix}`;
  return `COMANDA${suffix}`;
}

function groupByCourse(items: KitchenTicketInput['items']): Array<[number | null, KitchenTicketInput['items']]> {
  const map = new Map<number | null, KitchenTicketInput['items']>();
  for (const item of items) {
    const course = Number.isFinite(Number(item.course)) ? Number(item.course) : null;
    const list = map.get(course) || [];
    list.push(item);
    map.set(course, list);
  }
  return [...map.entries()].sort((a, b) => Number(a[0] || 0) - Number(b[0] || 0));
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
