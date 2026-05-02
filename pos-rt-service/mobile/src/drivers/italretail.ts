/**
 * Italretail driver mobile — registratori telematici (RT) di Ital Retail.
 *
 * I modelli più diffusi (Italstart, Nice, Big, Mech) sono di fatto rebrand di
 * stampanti Custom: usano il protocollo XON-XOFF su seriale RS-232 esposto via
 * convertitore TCP/IP (porta tipica 9100). Per questo motivo la strategia
 * `xon` (default) compone internamente `CustomXonDriverMobile` con defaults
 * tarati su Italretail.
 *
 * I modelli più recenti supportano XML 7.0 su HTTP/HTTPS/WebSocket — la
 * strategia `xml7` è il punto di estensione futuro (oggi throws NOT_IMPLEMENTED).
 *
 * Selettore in Settings → entry "Italretail (Italstart / Nice / Big)".
 */

import { CustomXonDriverMobile } from './customXon';
import { DriverError } from './types';
import type { DriverStatus, PrinterDriver, PrintOutcome, ReceiptInput } from './types';

export type ItalretailProtocol = 'xon' | 'xml7';

export interface ItalretailOptions {
  /** IP del registratore in LAN. */
  host: string;
  /** TCP port. Default 9100 per il convertitore seriale-LAN più diffuso. */
  port?: number;
  /** Operatore RT (1..N). Default '1'. */
  operator?: string;
  /** Timeout per singola operazione in ms. Default 30s. */
  timeoutMs?: number;
  /** Strategia wire. Default 'xon' (compatibile con la maggior parte dei modelli Italretail oggi installati). */
  protocol?: ItalretailProtocol;
}

export class ItalretailDriverMobile implements PrinterDriver {
  readonly name = 'italretail';
  private inner: PrinterDriver | null = null;
  private opts: Required<ItalretailOptions>;

  constructor(opts: ItalretailOptions) {
    this.opts = {
      port: 9100,
      operator: '1',
      timeoutMs: 30_000,
      protocol: 'xon',
      ...opts,
    } as Required<ItalretailOptions>;
  }

  async init(): Promise<void> {
    if (!this.opts.host) {
      throw new DriverError('DRIVER_UNAVAILABLE', 'italretail: opzione host mancante');
    }
    this.inner = this.buildInner();
    await this.inner.init();
  }

  async printReceipt(data: ReceiptInput): Promise<PrintOutcome> {
    const inner = await this.ensure();
    const out = await inner.printReceipt(data);
    return { ...out, driver: this.name };
  }

  async printFiscalReceipt(data: ReceiptInput): Promise<PrintOutcome> {
    const inner = await this.ensure();
    const out = await inner.printFiscalReceipt(data);
    return { ...out, driver: this.name };
  }

  async getStatus(): Promise<DriverStatus> {
    if (!this.inner) {
      try {
        this.inner = this.buildInner();
        await this.inner.init();
      } catch (err: any) {
        return { online: false, name: this.name, host: this.opts.host, error: err.message };
      }
    }
    const s = await this.inner.getStatus();
    return { ...s, name: this.name, protocol: this.opts.protocol };
  }

  async dispose(): Promise<void> {
    try {
      await this.inner?.dispose();
    } catch (_) {
      /* swallow */
    }
    this.inner = null;
  }

  private async ensure(): Promise<PrinterDriver> {
    if (!this.inner) await this.init();
    return this.inner!;
  }

  private buildInner(): PrinterDriver {
    if (this.opts.protocol === 'xml7') {
      throw new DriverError(
        'NOT_IMPLEMENTED',
        'italretail: strategia XML 7.0 non ancora implementata. Usa protocol="xon" per i modelli oggi installati.',
      );
    }
    // Strategia XON (default): delega a CustomXon con defaults Italretail.
    return new CustomXonDriverMobile({
      host: this.opts.host,
      port: this.opts.port,
      operator: this.opts.operator,
      timeoutMs: this.opts.timeoutMs,
    });
  }
}
