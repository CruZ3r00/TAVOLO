'use strict';

const { getLogger } = require('../../utils/logger');
const { AppError, CODES } = require('../../utils/errors');
const auditRepo = require('../../storage/repositories/auditRepo');
const { parseOrThrow, orderClosePayloadSchema } = require('../../utils/validation');

const log = getLogger('modules/payment');

/**
 * Handler per order.close: pagamento + stampa scontrino.
 *
 * Flusso:
 *   1. charge via payment driver (idempotency = event_id)
 *   2. su success: stampa fiscale (se RT) o scontrino di cortesia (default v1)
 *   3. se stampa fallisce dopo charge OK → audit + tentativo refund automatico
 *   4. outcome ritornato al queue manager, che ackerà a Strapi
 */
function createOrderCloseHandler({ driverRegistry }) {
  return async function handleOrderClose(payload, { job }) {
    parseOrThrow(orderClosePayloadSchema, payload);

    const { payment, printer } = driverRegistry;
    if (!payment) throw new AppError(CODES.DRIVER_UNAVAILABLE, 'Payment driver non caricato');
    if (!printer) throw new AppError(CODES.DRIVER_UNAVAILABLE, 'Printer driver non caricato');

    log.info(
      { event_id: job.event_id, amount: payload.amount, currency: payload.currency || 'EUR' },
      'Order close handler',
    );

    let chargeOutcome;
    try {
      chargeOutcome = await payment.charge({
        amount: payload.amount,
        currency: payload.currency || 'EUR',
        idempotencyKey: job.event_id,
        orderRef: payload.order_doc_id,
      });
    } catch (err) {
      auditRepo.append({
        kind: 'payment.failed',
        eventId: job.event_id,
        payload: { amount: payload.amount, order_doc_id: payload.order_doc_id },
        meta: { error: err.message },
      });
      throw err;
    }

    auditRepo.append({
      kind: 'payment.charged',
      eventId: job.event_id,
      payload: { amount: payload.amount, order_doc_id: payload.order_doc_id },
      meta: { transactionId: chargeOutcome.transactionId, driver: chargeOutcome.driver },
    });

    // stampa: v1 usa printReceipt (cortesia). In presenza di driver RT reale
    // sostituibile con printFiscalReceipt basandosi su payment_method.
    const useFiscal = payload.payment_method === 'fiscal_register';
    let printOutcome;
    try {
      printOutcome = useFiscal
        ? await printer.printFiscalReceipt(payload)
        : await printer.printReceipt(payload);
    } catch (err) {
      auditRepo.append({
        kind: 'print.failed_after_charge',
        eventId: job.event_id,
        payload: { order_doc_id: payload.order_doc_id, transactionId: chargeOutcome.transactionId },
        meta: { error: err.message },
      });
      // tentativo di refund automatico — best effort
      try {
        await payment.refund({ transactionId: chargeOutcome.transactionId, amount: payload.amount });
        auditRepo.append({
          kind: 'payment.refunded_auto',
          eventId: job.event_id,
          payload: { transactionId: chargeOutcome.transactionId, amount: payload.amount },
        });
      } catch (refundErr) {
        auditRepo.append({
          kind: 'payment.refund_failed',
          eventId: job.event_id,
          payload: { transactionId: chargeOutcome.transactionId },
          meta: { error: refundErr.message },
        });
      }
      throw err;
    }

    auditRepo.append({
      kind: 'receipt.printed',
      eventId: job.event_id,
      payload: { order_doc_id: payload.order_doc_id, fiscal: useFiscal },
      meta: { receipt_no: printOutcome?.receipt_no },
    });

    return {
      transactionId: chargeOutcome.transactionId,
      receipt_no: printOutcome?.receipt_no,
      amount: payload.amount,
      currency: payload.currency || 'EUR',
      driver_payment: chargeOutcome.driver,
      driver_printer: printOutcome?.driver,
      completed_at: new Date().toISOString(),
    };
  };
}

module.exports = { createOrderCloseHandler };
