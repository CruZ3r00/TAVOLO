/**
 * Job dispatcher — riceve un job (kind + payload) e instrada al driver.
 *
 * Equivalente mobile di pos-rt-service/src/modules/payment/index.js +
 * print/index.js. La differenza è che qui i driver sono porta-mobile
 * (TypeScript usando @capacitor-community/tcp-socket o simili).
 */

import { driverRegistry } from '../drivers/registry';

export interface Job {
  id: string;
  event_id: string;
  kind: string;
  payload: Record<string, any>;
  priority?: number;
}

export interface JobOutcome {
  transactionId?: string;
  receipt_no?: string;
  amount?: number;
  currency?: string;
  fiscal?: boolean;
  driver_payment?: string;
  driver_printer?: string;
  completed_at: string;
  [k: string]: unknown;
}

class JobHandlers {
  async dispatch(job: Job): Promise<JobOutcome> {
    switch (job.kind) {
      case 'order.close':
        return this.handleOrderClose(job);
      case 'print.receipt':
        return this.handlePrintReceipt(job);
      default:
        throw new Error(`Job kind non supportato: ${job.kind}`);
    }
  }

  private async handleOrderClose(job: Job): Promise<JobOutcome> {
    const payment = await driverRegistry.getPayment();
    const printer = await driverRegistry.getPrinter();
    const p = job.payload;

    const charge = await payment.charge({
      amount: Number(p.amount),
      currency: String(p.currency || 'EUR'),
      idempotencyKey: job.event_id,
      orderRef: p.order_doc_id,
    });

    const useFiscal = p.payment_method === 'fiscal_register' || p.payment_method === 'pos';
    let print: any;
    try {
      print = useFiscal
        ? await printer.printFiscalReceipt({
            items: p.items || [],
            total: Number(p.amount),
            payment_method: p.payment_method || 'cash',
          })
        : await printer.printReceipt({
            items: p.items || [],
            total: Number(p.amount),
          });
    } catch (err) {
      // Best-effort refund se la stampa fiscale fallisce dopo il charge
      try {
        await payment.refund({ transactionId: charge.transactionId, amount: Number(p.amount) });
      } catch (_) {
        /* refund failure is logged separately */
      }
      throw err;
    }

    return {
      transactionId: charge.transactionId,
      receipt_no: print?.receipt_no,
      amount: Number(p.amount),
      currency: p.currency || 'EUR',
      fiscal: useFiscal,
      driver_payment: charge.driver,
      driver_printer: print?.driver,
      completed_at: new Date().toISOString(),
    };
  }

  private async handlePrintReceipt(job: Job): Promise<JobOutcome> {
    const printer = await driverRegistry.getPrinter();
    const data = (job.payload || {}) as any;
    const r = await printer.printReceipt({
      items: Array.isArray(data.items) ? data.items : [],
      total: data.total,
      header: data.header,
      footer: data.footer,
    });
    return {
      receipt_no: r?.receipt_no,
      driver_printer: r?.driver,
      completed_at: new Date().toISOString(),
    };
  }
}

export const jobHandlers = new JobHandlers();
