'use strict';

const { PrinterDriver } = require('./base');
const { AppError, CODES } = require('../../utils/errors');
const { randomToken } = require('../../utils/crypto');
const { sleep } = require('../../utils/backoff');
const { getLogger } = require('../../utils/logger');

const log = getLogger('drivers/printer/stub');

class StubPrinterDriver extends PrinterDriver {
  constructor(options = {}) {
    super(options);
    this.name = 'stub';
    this.latencyMs = options.latencyMs ?? 200;
    this.failureRate = options.failureRate ?? 0;
    this.initialized = false;
  }

  async init() {
    this.initialized = true;
    log.info({ options: this.options }, 'Stub printer inizializzato');
  }

  async printReceipt(data) {
    return this._simulate('receipt', data);
  }

  async printFiscalReceipt(data) {
    return this._simulate('fiscal_receipt', data);
  }

  async _simulate(kind, data) {
    if (!this.initialized) await this.init();
    await sleep(this.latencyMs);
    if (Math.random() < this.failureRate) {
      throw new AppError(CODES.DRIVER_ERROR, 'Stub printer: failure simulato');
    }
    const receiptNo = randomToken(4);
    log.info(
      { kind, items: data?.items?.length, total: data?.total, receiptNo },
      '[STUB PRINTER] Scontrino stampato',
    );
    return {
      success: true,
      receipt_no: receiptNo,
      timestamp: new Date().toISOString(),
      driver: this.name,
    };
  }

  async getStatus() {
    return { online: true, name: this.name, initialized: this.initialized };
  }
}

module.exports = { StubPrinterDriver };
