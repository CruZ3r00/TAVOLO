'use strict';

const { AppError, CODES } = require('../../utils/errors');

class PaymentDriver {
  constructor(options = {}) {
    this.options = options;
    this.name = 'abstract';
  }

  async init() {
    throw new AppError(CODES.NOT_IMPLEMENTED, `${this.name}.init() non implementato`);
  }

  /**
   * Charge.
   * @param {Object} data
   * @param {Number} data.amount
   * @param {String} data.currency  (default 'EUR')
   * @param {String} data.idempotencyKey (event_id del job)
   * @param {String} [data.orderRef]
   */
  async charge(_data) {
    throw new AppError(CODES.NOT_IMPLEMENTED, `${this.name}.charge() non implementato`);
  }

  async refund(_data) {
    throw new AppError(CODES.NOT_IMPLEMENTED, `${this.name}.refund() non implementato`);
  }

  async getStatus() {
    return { online: false, name: this.name };
  }

  async dispose() {
    /* no-op */
  }
}

module.exports = { PaymentDriver };
