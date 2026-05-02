/**
 * Job dispatcher — riceve un job (kind + payload) e instrada al driver.
 *
 * Equivalente mobile di pos-rt-service/src/modules/payment/index.js +
 * print/index.js. La differenza è che qui i driver sono porta-mobile
 * (TypeScript usando Capacitor plugin nativi) e l'idempotency è persistita
 * (`persistedIdempotencyStore`) per resistere ai kill dell'app.
 *
 * **Pre-check idempotency (handleOrderClose):**
 *   1. Read store su `event_id`
 *   2. completed → ritorna outcome cached, NIENTE re-charge sul POS
 *   3. pending → tentativo di recovery:
 *      - se driver supporta `inquiry()` → chiede al terminale
 *      - approved → markCompleted, prosegui con stampa
 *      - not-found → safe re-issue
 *      - errore → markFailed, throw (oste verifica manualmente)
 *      - se driver NON supporta `inquiry()` → markFailed, throw
 *   4. null o failed → setPending → charge → markCompleted/Failed
 */

import { driverRegistry } from '../drivers/registry';
import { persistedIdempotencyStore } from './idempotency';
import type { ChargeOutcome, PaymentDriver } from '../drivers/types';

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
  recovered?: boolean;
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
    const amountCents = Math.round(Number(p.amount) * 100);
    const eventId = job.event_id;
    const orderRef: string | null = p.order_doc_id ?? null;

    let charge: ChargeOutcome;
    let recovered = false;

    const prior = await persistedIdempotencyStore.get(eventId);
    if (prior?.status === 'completed' && prior.outcome) {
      // Replay protection: il charge è già andato a buon fine in passato.
      charge = prior.outcome;
      recovered = true;
    } else if (prior?.status === 'pending') {
      const recoveredOutcome = await this.attemptRecovery(payment, eventId, prior.transactionId, {
        amountCents: prior.amountCents,
        orderRef: prior.orderRef,
      });
      if (recoveredOutcome) {
        await persistedIdempotencyStore.markCompleted(eventId, recoveredOutcome);
        charge = recoveredOutcome;
        recovered = true;
      } else {
        // Inquiry confermò "non trovata" → re-issue è safe
        charge = await this.chargeWithGuard(payment, eventId, {
          amount: Number(p.amount),
          currency: p.currency || 'EUR',
          orderRef: p.order_doc_id,
          amountCents,
        });
      }
    } else {
      charge = await this.chargeWithGuard(payment, eventId, {
        amount: Number(p.amount),
        currency: p.currency || 'EUR',
        orderRef: p.order_doc_id,
        amountCents,
      });
    }

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
      // Best-effort refund se la stampa fiscale fallisce dopo il charge.
      // Non rifacciamo refund se charge è stato "recuperato" da Inquiry: in quel caso
      // il refund automatico potrebbe addirittura fallire (transazione già chiusa lato terminale).
      if (!recovered) {
        try {
          await payment.refund({ transactionId: charge.transactionId, amount: Number(p.amount) });
        } catch (_) {
          /* refund failure è loggato a parte da ack outcome */
        }
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
      recovered,
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

  /**
   * Esegue charge con WAL persistito attorno: setPending → charge → markCompleted/Failed.
   */
  private async chargeWithGuard(
    payment: PaymentDriver,
    eventId: string,
    args: { amount: number; currency: string; orderRef?: string | null; amountCents: number },
  ): Promise<ChargeOutcome> {
    await persistedIdempotencyStore.setPending(eventId, {
      key: eventId,
      driver: payment.name,
      orderRef: args.orderRef ?? null,
      transactionId: eventId, // initial guess: eventId, sarà aggiornato col tx reale
      amountCents: args.amountCents,
    });
    let charge: ChargeOutcome;
    try {
      charge = await payment.charge({
        amount: args.amount,
        currency: args.currency,
        idempotencyKey: eventId,
        orderRef: args.orderRef ?? undefined,
      });
    } catch (err: any) {
      await persistedIdempotencyStore.markFailed(eventId, {
        code: err?.code || 'CHARGE_FAILED',
        message: err?.message || String(err),
      });
      throw err;
    }
    await persistedIdempotencyStore.markCompleted(eventId, charge);
    return charge;
  }

  /**
   * Tentativo di recovery quando troviamo un record `pending`. Ritorna ChargeOutcome
   * se recuperato, null se l'Inquiry conferma "transazione non trovata".
   * Throw se Inquiry fallisce o se il driver non supporta Inquiry: in quel caso
   * marchiamo failed e preferiamo bloccare il flusso piuttosto che rischiare
   * il doppio addebito.
   */
  private async attemptRecovery(
    payment: PaymentDriver,
    eventId: string,
    txnRef: string | undefined,
    hint: { amountCents?: number; orderRef: string | null },
  ): Promise<ChargeOutcome | null> {
    if (!txnRef) {
      const msg = `Recovery impossibile: nessun txnRef registrato per ${eventId}`;
      await persistedIdempotencyStore.markFailed(eventId, { code: 'RECOVERY_NO_REF', message: msg });
      throw new Error(msg);
    }
    if (typeof payment.inquiry !== 'function') {
      const msg =
        `Pagamento in stato pending sul driver "${payment.name}", che non supporta Inquiry. ` +
        `Verifica manuale dello scontrino POS richiesta prima di chiudere l'ordine.`;
      await persistedIdempotencyStore.markFailed(eventId, { code: 'INQUIRY_UNSUPPORTED', message: msg });
      throw new Error(msg);
    }
    try {
      return await payment.inquiry(txnRef, hint);
    } catch (err: any) {
      await persistedIdempotencyStore.markFailed(eventId, {
        code: err?.code || 'INQUIRY_FAILED',
        message: `Recovery Inquiry fallito: ${err?.message || String(err)}. Verifica manuale.`,
      });
      throw err;
    }
  }
}

export const jobHandlers = new JobHandlers();
