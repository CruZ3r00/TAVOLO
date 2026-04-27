'use strict';

const { PaymentDriver } = require('./base');
const { AppError, CODES } = require('../../utils/errors');
const { randomToken } = require('../../utils/crypto');
const { sleep } = require('../../utils/backoff');
const { getLogger } = require('../../utils/logger');

const log = getLogger('drivers/payment/stub');

class StubPaymentDriver extends PaymentDriver {
  constructor(options = {}) {
    super(options);
    this.name = 'stub';
    this.latencyMs = options.latencyMs ?? 200;
    this.failureRate = options.failureRate ?? 0;
    this.initialized = false;
    this._idempotencyCache = new Map(); // idempotencyKey -> outcome
  }

  async init() {
    this.initialized = true;
    log.info({ options: this.options }, 'Stub payment inizializzato');
  }

  async charge({ amount, currency = 'EUR', idempotencyKey, orderRef }) {
    if (!this.initialized) await this.init();

    if (idempotencyKey && this._idempotencyCache.has(idempotencyKey)) {
      const cached = this._idempotencyCache.get(idempotencyKey);
      log.info({ idempotencyKey }, '[STUB PAYMENT] Risposta idempotente servita dalla cache');
      return cached;
    }

    await sleep(this.latencyMs);

    if (Math.random() < this.failureRate) {
      throw new AppError(CODES.PAYMENT_DECLINED, 'Stub payment: failure simulato');
    }

    const outcome = {
      success: true,
      transactionId: `STUB-${randomToken(6).toUpperCase()}`,
      amount,
      currency,
      orderRef: orderRef || null,
      timestamp: new Date().toISOString(),
      driver: this.name,
    };
    if (idempotencyKey) this._idempotencyCache.set(idempotencyKey, outcome);
    log.info({ idempotencyKey, amount, currency, txn: outcome.transactionId }, '[STUB PAYMENT] Charge OK');
    return outcome;
  }

  async refund({ transactionId, amount }) {
    if (!this.initialized) await this.init();
    await sleep(this.latencyMs);
    return {
      success: true,
      refundId: `STUB-R-${randomToken(6).toUpperCase()}`,
      transactionId,
      amount,
      timestamp: new Date().toISOString(),
      driver: this.name,
    };
  }

  async getStatus() {
    return { online: true, name: this.name, initialized: this.initialized };
  }
}

module.exports = { StubPaymentDriver };
