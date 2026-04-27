/**
 * Epson FPMate driver mobile — funziona con fetch nativo, niente plugin
 * Capacitor extra. È il driver RT più importante (dominante in Italia).
 *
 * Stesso protocollo del daemon Node (XML SOAP su HTTP /cgi-bin/fpmate.cgi).
 * Codice porta-mobile, niente import dal Node.
 */

import { DriverError } from './types';
import type { DriverStatus, PrinterDriver, PrintOutcome, ReceiptInput } from './types';

export interface EpsonFpMateOptions {
  host: string;
  port?: number;
  https?: boolean;
  username?: string;
  password?: string;
  timeoutMs?: number;
  operator?: string;
  vatGroup?: string;
  path?: string;
}

export class EpsonFpMateDriverMobile implements PrinterDriver {
  readonly name = 'epson-fpmate';
  private opts: EpsonFpMateOptions;
  private initialized = false;

  constructor(opts: EpsonFpMateOptions) {
    this.opts = {
      port: 80,
      https: false,
      timeoutMs: 30_000,
      operator: '1',
      vatGroup: '1',
      path: '/cgi-bin/fpmate.cgi',
      ...opts,
    };
  }

  async init(): Promise<void> {
    if (!this.opts.host) {
      throw new DriverError('DRIVER_UNAVAILABLE', 'epson-fpmate: opzione host mancante');
    }
    try { await this.getStatus(); } catch (_) { /* non fatale */ }
    this.initialized = true;
  }

  async printReceipt(data: ReceiptInput): Promise<PrintOutcome> {
    if (!this.initialized) await this.init();
    const xml = this.buildNonFiscalXml(data);
    const resp = await this.post(xml);
    return this.parse(resp, false);
  }

  async printFiscalReceipt(data: ReceiptInput): Promise<PrintOutcome> {
    if (!this.initialized) await this.init();
    const xml = this.buildFiscalXml(data);
    const resp = await this.post(xml);
    return this.parse(resp, true);
  }

  async getStatus(): Promise<DriverStatus> {
    try {
      const resp = await this.post(this.wrap(`<printerCommand><queryPrinterStatus statusType="1"/></printerCommand>`), 5_000);
      const ok = /success="true"/.test(resp);
      return { online: ok, name: this.name, host: this.opts.host };
    } catch (err: any) {
      return { online: false, name: this.name, host: this.opts.host, error: err.message };
    }
  }

  async dispose(): Promise<void> {
    /* noop */
  }

  private buildFiscalXml(data: ReceiptInput): string {
    const items = Array.isArray(data.items) ? data.items : [];
    const lines = items.map((it) => {
      const desc = esc(String(it.name || it.description || 'voce').slice(0, 38));
      const qty = String(it.quantity || 1);
      const cents = Math.round(Number(it.unit_price || it.price || 0) * 100);
      const dept = String(it.vatGroup || it.department || this.opts.vatGroup);
      return `<printRecItem description="${desc}" quantity="${qty}" unitPrice="${cents}" department="${dept}" justification="0"/>`;
    }).join('');
    const total = Math.round(Number(data.total || 0) * 100);
    const payDesc = esc(String(data.payment_description || data.payment_method || 'Pagamento').slice(0, 38));
    const payType = String(data.payment_type ?? this.mapPaymentType(data.payment_method));
    const inner =
      `<printerFiscalReceipt>` +
      `<beginFiscalReceipt operator="${esc(this.opts.operator!)}"/>` +
      lines +
      `<printRecTotal payment="${total}" description="${payDesc}" paymentType="${payType}"/>` +
      `<endFiscalReceipt/>` +
      `</printerFiscalReceipt>`;
    return this.wrap(inner);
  }

  private buildNonFiscalXml(data: ReceiptInput): string {
    const items = Array.isArray(data.items) ? data.items : [];
    const lines = items.map((it) => {
      const desc = esc(String(it.name || it.description || 'voce').slice(0, 46));
      const qty = it.quantity || 1;
      const unit = Number(it.unit_price || it.price || 0).toFixed(2);
      return `<printNormal operator="${esc(this.opts.operator!)}" data="${desc}  ${qty}x ${unit}" font="1"/>`;
    }).join('');
    const totalLine = data.total != null
      ? `<printNormal operator="${esc(this.opts.operator!)}" data="TOTALE: ${Number(data.total).toFixed(2)} EUR" font="2"/>`
      : '';
    const inner =
      `<printerNonFiscal>` +
      `<beginNonFiscal operator="${esc(this.opts.operator!)}"/>` +
      lines +
      totalLine +
      `<endNonFiscal/>` +
      `</printerNonFiscal>`;
    return this.wrap(inner);
  }

  private wrap(inner: string): string {
    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">` +
      `<s:Body>${inner}</s:Body>` +
      `</s:Envelope>`
    );
  }

  private mapPaymentType(method?: string): number {
    if (!method) return 0;
    const m = method.toLowerCase();
    if (m === 'cash' || m === 'contanti') return 0;
    if (m === 'card' || m === 'pos' || m === 'credit_card') return 2;
    if (m === 'meal_voucher' || m === 'ticket') return 3;
    return 4;
  }

  private parse(xml: string, fiscal: boolean): PrintOutcome {
    const success = /success="true"/.test(xml);
    if (!success) {
      const code = (xml.match(/code="(\d+)"/) || [])[1] || '999';
      const status = (xml.match(/status="([^"]*)"/) || [])[1] || 'errore RT';
      throw new DriverError('DRIVER_ERROR', `epson-fpmate: ${status} (code=${code})`);
    }
    const fiscalNo =
      (xml.match(/<receiptNumber>(\d+)<\/receiptNumber>/) || [])[1] ||
      (xml.match(/fiscalReceiptNumber="(\d+)"/) || [])[1] ||
      `EP-${Date.now()}`;
    return {
      success: true,
      receipt_no: fiscalNo,
      fiscal,
      timestamp: new Date().toISOString(),
      driver: this.name,
    };
  }

  private async post(body: string, timeoutMs?: number): Promise<string> {
    const url = `${this.opts.https ? 'https' : 'http'}://${this.opts.host}:${this.opts.port}${this.opts.path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/xml; charset=utf-8',
    };
    if (this.opts.username) {
      const auth = btoa(`${this.opts.username}:${this.opts.password || ''}`);
      headers['Authorization'] = `Basic ${auth}`;
    }
    const ctrl = new AbortController();
    const tmo = setTimeout(() => ctrl.abort(), timeoutMs ?? this.opts.timeoutMs!);
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', headers, body, signal: ctrl.signal });
    } catch (err: any) {
      clearTimeout(tmo);
      if (err.name === 'AbortError') {
        throw new DriverError('DRIVER_TIMEOUT', `epson-fpmate timeout`);
      }
      throw new DriverError('DRIVER_UNAVAILABLE', `epson-fpmate: ${err.message}`);
    }
    clearTimeout(tmo);
    if (!res.ok) {
      throw new DriverError('DRIVER_ERROR', `epson-fpmate HTTP ${res.status}`);
    }
    return await res.text();
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
