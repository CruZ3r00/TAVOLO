'use strict';

const { AppError, CODES } = require('../utils/errors');
const { getLogger } = require('../utils/logger');

const log = getLogger('drivers/registry');

// Lazy require: ogni driver è importato solo quando selezionato in config.
// Questo evita di caricare native deps (es. serialport per escpos-bt) se non in uso.
const PRINTERS = {
  stub: () => require('./printer/stub').StubPrinterDriver,
  'epson-fpmate': () => require('./printer/epson-fpmate').EpsonFpMateDriver,
  'custom-xon': () => require('./printer/custom-xon').CustomXonDriver,
  'escpos-fiscal': () => require('./printer/escpos-fiscal').EscposFiscalDriver,
};

const PAYMENTS = {
  stub: () => require('./payment/stub').StubPaymentDriver,
  'generic-ecr': () => require('./payment/generic-ecr').GenericEcrDriver,
  'jpos': () => require('./payment/jpos').JposDriver,
  'escpos-bt': () => require('./payment/escpos-bt').EscPosBtDriver,
};

class DriverRegistry {
  constructor({ printerName, paymentName, config }) {
    this.printerName = printerName;
    this.paymentName = paymentName;
    this.config = config;
    this.printer = null;
    this.payment = null;
  }

  async loadAll() {
    this.printer = this._load('printer', this.printerName, PRINTERS);
    this.payment = this._load('payment', this.paymentName, PAYMENTS);
    // init() best-effort: se fallisce (es. host non configurato), wrappa il
    // driver in proxy degradato. Il servizio parte comunque, la dashboard
    // può configurare i driver, le operazioni sul driver lanciano
    // DRIVER_UNAVAILABLE finché non si reload.
    this.printer = await this._tryInit('printer', this.printer);
    this.payment = await this._tryInit('payment', this.payment);
    log.info(
      {
        printer: this.printerName,
        payment: this.paymentName,
        printerReady: !this.printer.__degraded,
        paymentReady: !this.payment.__degraded,
      },
      'Driver caricati',
    );
  }

  async _tryInit(category, instance) {
    try {
      await instance.init();
      return instance;
    } catch (err) {
      log.warn(
        { category, driver: instance.name, err: err.message },
        'Driver init fallita: passo in modalità degradata',
      );
      return makeDegradedProxy(instance, err);
    }
  }

  _load(category, name, registry) {
    const factory = registry[name];
    if (!factory) {
      const available = Object.keys(registry).join(', ');
      throw new AppError(
        CODES.DRIVER_UNAVAILABLE,
        `${category} driver "${name}" non disponibile (disponibili: ${available})`,
      );
    }
    const Klass = factory();
    const opts = this.config.drivers[name] || this.config.drivers.stub;
    return new Klass(opts);
  }

  async disposeAll() {
    try {
      await this.printer?.dispose?.();
    } catch (e) {
      log.warn({ err: e }, 'Errore dispose printer');
    }
    try {
      await this.payment?.dispose?.();
    } catch (e) {
      log.warn({ err: e }, 'Errore dispose payment');
    }
  }

  async status() {
    const [p, q] = await Promise.all([
      this.printer?.getStatus?.() || { online: false },
      this.payment?.getStatus?.() || { online: false },
    ]);
    return { printer: p, payment: q };
  }
}

/**
 * Wrappa un driver che ha fallito init() in un proxy che:
 *  - getStatus()           → { online: false, error: <init-err>, degraded: true }
 *  - dispose()             → no-op
 *  - qualsiasi altra op    → throw DRIVER_UNAVAILABLE con il motivo originale
 */
function makeDegradedProxy(instance, initErr) {
  const reason = initErr?.message || 'driver non inizializzato';
  const proxy = {
    __degraded: true,
    name: instance.name,
    options: instance.options,
    async getStatus() {
      return { online: false, name: instance.name, degraded: true, error: reason };
    },
    async dispose() {
      try { await instance.dispose?.(); } catch (_) {}
    },
  };
  // Aggiungi tutti i metodi noti come throw "DRIVER_UNAVAILABLE"
  for (const m of ['init', 'charge', 'refund', 'printReceipt', 'printFiscalReceipt']) {
    proxy[m] = async () => {
      throw new AppError(
        CODES.DRIVER_UNAVAILABLE,
        `Driver "${instance.name}" non configurato/raggiungibile: ${reason}`,
      );
    };
  }
  return proxy;
}

module.exports = { DriverRegistry };
