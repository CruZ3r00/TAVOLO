import type { DriverStatus, PrinterDriver, PrintOutcome, ReceiptInput } from './types';

export class StubPrinterDriver implements PrinterDriver {
  readonly name = 'stub';
  private latencyMs: number;
  private initialized = false;

  constructor(opts: { latencyMs?: number } = {}) {
    this.latencyMs = opts.latencyMs ?? 200;
  }

  async init(): Promise<void> {
    this.initialized = true;
  }

  async printReceipt(data: ReceiptInput): Promise<PrintOutcome> {
    return this.simulate(false, data);
  }

  async printFiscalReceipt(data: ReceiptInput): Promise<PrintOutcome> {
    return this.simulate(true, data);
  }

  private async simulate(fiscal: boolean, _data: ReceiptInput): Promise<PrintOutcome> {
    if (!this.initialized) await this.init();
    await new Promise((r) => setTimeout(r, this.latencyMs));
    const arr = new Uint8Array(4);
    crypto.getRandomValues(arr);
    const receiptNo = Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
    return {
      success: true,
      receipt_no: receiptNo,
      fiscal,
      timestamp: new Date().toISOString(),
      driver: this.name,
    };
  }

  async getStatus(): Promise<DriverStatus> {
    return { online: true, name: this.name };
  }

  async dispose(): Promise<void> {
    /* noop */
  }
}
