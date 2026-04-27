'use strict';

const { getLogger } = require('../../utils/logger');
const { AppError, CODES } = require('../../utils/errors');
const auditRepo = require('../../storage/repositories/auditRepo');

const log = getLogger('modules/print');

/**
 * Handler per print.receipt (scontrino di cortesia, non fiscale).
 */
function createPrintReceiptHandler({ driverRegistry }) {
  return async function handlePrintReceipt(payload, { job }) {
    const driver = driverRegistry.printer;
    if (!driver) throw new AppError(CODES.DRIVER_UNAVAILABLE, 'Printer driver non caricato');

    log.info({ event_id: job.event_id }, 'Print receipt');
    const outcome = await driver.printReceipt(payload);
    auditRepo.append({
      kind: 'receipt.printed',
      eventId: job.event_id,
      payload: { total: payload?.total, items_count: payload?.items?.length || 0 },
      meta: { receipt_no: outcome?.receipt_no, driver: outcome?.driver },
    });
    return outcome;
  };
}

module.exports = { createPrintReceiptHandler };
