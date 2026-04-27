'use strict';

const { AppError, CODES } = require('../../utils/errors');

/**
 * Interfaccia astratta PrinterDriver. Ogni driver concreto deve implementare
 * init/printReceipt/printFiscalReceipt/getStatus/dispose.
 */
class PrinterDriver {
  constructor(options = {}) {
    this.options = options;
    this.name = 'abstract';
  }

  async init() {
    throw new AppError(CODES.NOT_IMPLEMENTED, `${this.name}.init() non implementato`);
  }

  /**
   * Stampa uno scontrino non fiscale (di cortesia / pre-conto).
   * @param {Object} data
   * @param {Array<{name, quantity, unit_price}>} data.items
   * @param {Number} data.total
   * @param {String} [data.header]
   * @param {String} [data.footer]
   */
  async printReceipt(_data) {
    throw new AppError(CODES.NOT_IMPLEMENTED, `${this.name}.printReceipt() non implementato`);
  }

  /**
   * Stampa scontrino fiscale via RT certificato.
   * @param {Object} data
   */
  async printFiscalReceipt(_data) {
    throw new AppError(CODES.NOT_IMPLEMENTED, `${this.name}.printFiscalReceipt() non implementato`);
  }

  async getStatus() {
    return { online: false, name: this.name };
  }

  async dispose() {
    /* no-op default */
  }
}

module.exports = { PrinterDriver };
