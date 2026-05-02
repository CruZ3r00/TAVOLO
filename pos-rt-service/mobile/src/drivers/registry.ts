/**
 * Driver registry mobile — equivalente di pos-rt-service/src/drivers/registry.js.
 * Lazy-load + degraded-proxy fallback: il polling continua anche se i driver
 * non sono configurati / il device hardware è offline.
 */

import { devicePersistence } from '../core/persistence';
import { DriverError } from './types';
import type { PaymentDriver, PrinterDriver } from './types';

type PrinterFactory = (opts: any) => Promise<PrinterDriver>;
type PaymentFactory = (opts: any) => Promise<PaymentDriver>;

const PRINTERS: Record<string, PrinterFactory> = {
  stub: async (opts) => new (await import('./stubPrinter')).StubPrinterDriver(opts),
  'epson-fpmate': async (opts) => new (await import('./epsonFpmate')).EpsonFpMateDriverMobile(opts),
  'custom-xon': async (opts) => new (await import('./customXon')).CustomXonDriverMobile(opts),
  'escpos-fiscal': async (opts) => new (await import('./escposFiscal')).EscposFiscalDriverMobile(opts),
  italretail: async (opts) => new (await import('./italretail')).ItalretailDriverMobile(opts),
};

const PAYMENTS: Record<string, PaymentFactory> = {
  stub: async (opts) => new (await import('./stubPayment')).StubPaymentDriver(opts),
  'generic-ecr': async (opts) => new (await import('./genericEcr')).GenericEcrDriverMobile(opts),
  jpos: async (opts) => new (await import('./jpos')).JposDriverMobile(opts),
  'nexi-p17': async (opts) => new (await import('./nexiP17')).NexiP17DriverMobile(opts),
  'escpos-bt': async (opts) => new (await import('./escposBt')).EscPosBtDriverMobile(opts),
};

class DriverRegistry {
  private printer: PrinterDriver | null = null;
  private payment: PaymentDriver | null = null;

  async getPrinter(): Promise<PrinterDriver> {
    if (this.printer) return this.printer;
    const cfg = await devicePersistence.getDrivers();
    this.printer = await this.buildPrinter(cfg.printer.name, cfg.printer.options);
    return this.printer;
  }

  async getPayment(): Promise<PaymentDriver> {
    if (this.payment) return this.payment;
    const cfg = await devicePersistence.getDrivers();
    this.payment = await this.buildPayment(cfg.payment.name, cfg.payment.options);
    return this.payment;
  }

  /** Forza reload (es. dopo update config in Settings.vue). */
  async reload(): Promise<void> {
    try { await this.printer?.dispose(); } catch (_) { /* swallow */ }
    try { await this.payment?.dispose(); } catch (_) { /* swallow */ }
    this.printer = null;
    this.payment = null;
  }

  async buildPrinter(name: string, opts: any): Promise<PrinterDriver> {
    const factory = PRINTERS[name];
    if (!factory) {
      return makeDegradedPrinter(name, new DriverError('DRIVER_UNAVAILABLE', `Printer "${name}" non registrato`));
    }
    try {
      const drv = await factory(opts || {});
      await drv.init();
      return drv;
    } catch (err: any) {
      return makeDegradedPrinter(name, err);
    }
  }

  async buildPayment(name: string, opts: any): Promise<PaymentDriver> {
    const factory = PAYMENTS[name];
    if (!factory) {
      return makeDegradedPayment(name, new DriverError('DRIVER_UNAVAILABLE', `Payment "${name}" non registrato`));
    }
    try {
      const drv = await factory(opts || {});
      await drv.init();
      return drv;
    } catch (err: any) {
      return makeDegradedPayment(name, err);
    }
  }

  async status(): Promise<{ printer: any; payment: any }> {
    const [p, q] = await Promise.all([
      (await this.getPrinter()).getStatus(),
      (await this.getPayment()).getStatus(),
    ]);
    return { printer: p, payment: q };
  }
}

function makeDegradedPrinter(name: string, err: any): PrinterDriver {
  const reason = err?.message || 'driver non inizializzato';
  return {
    name,
    async init() { throw new DriverError('DRIVER_UNAVAILABLE', `Printer "${name}": ${reason}`); },
    async printReceipt() { throw new DriverError('DRIVER_UNAVAILABLE', `Printer "${name}": ${reason}`); },
    async printFiscalReceipt() { throw new DriverError('DRIVER_UNAVAILABLE', `Printer "${name}": ${reason}`); },
    async getStatus() { return { online: false, name, degraded: true, error: reason }; },
    async dispose() { /* noop */ },
  };
}

function makeDegradedPayment(name: string, err: any): PaymentDriver {
  const reason = err?.message || 'driver non inizializzato';
  return {
    name,
    async init() { throw new DriverError('DRIVER_UNAVAILABLE', `Payment "${name}": ${reason}`); },
    async charge() { throw new DriverError('DRIVER_UNAVAILABLE', `Payment "${name}": ${reason}`); },
    async refund() { throw new DriverError('DRIVER_UNAVAILABLE', `Payment "${name}": ${reason}`); },
    async getStatus() { return { online: false, name, degraded: true, error: reason }; },
    async dispose() { /* noop */ },
  };
}

export const driverRegistry = new DriverRegistry();
