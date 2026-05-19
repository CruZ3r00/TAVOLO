'use strict';

const { AppError, CODES } = require('../utils/errors');
const { getLogger } = require('../utils/logger');

const log = getLogger('drivers/registry');

// Lazy require: ogni driver e' importato solo quando selezionato in config.
// Questo evita di caricare native deps (es. serialport per escpos-bt) se non in uso.
const PRINTERS = {
  stub: () => require('./printer/stub').StubPrinterDriver,
  'epson-fpmate': () => require('./printer/epson-fpmate').EpsonFpMateDriver,
  'custom-xon': () => require('./printer/custom-xon').CustomXonDriver,
  'escpos-fiscal': () => require('./printer/escpos-fiscal').EscposFiscalDriver,
  'escpos-network': () => require('./printer/escpos-network').EscposNetworkDriver,
  italretail: () => require('./printer/italretail').ItalretailDriver,
};

const PAYMENTS = {
  stub: () => require('./payment/stub').StubPaymentDriver,
  'generic-ecr': () => require('./payment/generic-ecr').GenericEcrDriver,
  jpos: () => require('./payment/jpos').JposDriver,
  'escpos-bt': () => require('./payment/escpos-bt').EscPosBtDriver,
  'nexi-p17': () => require('./payment/nexi-p17').NexiP17Driver,
};

class DriverRegistry {
  constructor({ printerName, paymentName, config }) {
    this.printerName = printerName;
    this.paymentName = paymentName;
    this.config = config;
    this.printer = null;
    this.payment = null;

    // Multi-printer: stazioni comande e dispositivi cassa
    this.stationPrinters = new Map();
    this.cashDevices = new Map();

    // Single-flight lock per reload
    this._reloading = false;
  }

  async loadAll() {
    this.printer = this._load('printer', this.printerName, PRINTERS);
    this.payment = this._load('payment', this.paymentName, PAYMENTS);
    // init() best-effort: se fallisce (es. host non configurato), wrappa il
    // driver in proxy degradato. Il servizio parte comunque, la dashboard
    // puo configurare i driver, le operazioni sul driver lanciano
    // DRIVER_UNAVAILABLE finche non si reload.
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

  /**
   * Carica driver da rows printer_targets (sincronizzate da Strapi).
   * Per ogni row: lazy-load driver via factory, _tryInit, inserisci in Map.
   * @param {Array<{role,key,driver,host,port,options_json,capabilities_json,enabled}>} rows
   */
  async loadFromTargets(rows) {
    for (const row of rows) {
      if (!row.enabled) continue;
      const opts = this._buildDriverOpts(row);
      const driverName = row.driver;

      try {
        let instance;
        if (row.role === 'station') {
          instance = this._loadByName(driverName, PRINTERS, opts);
          instance = await this._tryInit(`station:${row.key}`, instance);
          this.stationPrinters.set(row.key, instance);
        } else if (row.role === 'cash') {
          // Cash devices possono essere printer O payment driver
          const isPrinter = !!PRINTERS[driverName];
          const isPayment = !!PAYMENTS[driverName];
          if (isPrinter) {
            instance = this._loadByName(driverName, PRINTERS, opts);
          } else if (isPayment) {
            instance = this._loadByName(driverName, PAYMENTS, opts);
          } else {
            log.warn({ driverName, key: row.key }, 'Driver non trovato per cash device');
            continue;
          }
          instance = await this._tryInit(`cash:${row.key}`, instance);
          // Attach capabilities metadata per il routing
          instance.__capabilities = this._parseCapabilities(row.capabilities_json);
          instance.__role = 'cash';
          instance.__key = row.key;
          this.cashDevices.set(row.key, instance);
        }
      } catch (err) {
        log.warn({ driver: driverName, key: row.key, err: err.message }, 'loadFromTargets: skip driver');
      }
    }
    log.info(
      { stations: this.stationPrinters.size, cashDevices: this.cashDevices.size },
      'Targets caricati',
    );
  }

  /**
   * Ritorna il driver stampante per una station (cucina, bar, ecc.).
   * Fallback al driver printer di default se la station non e' configurata.
   * @param {string} station
   * @returns {Object}
   */
  getPrinterForStation(station) {
    const key = String(station || '').trim().toLowerCase();
    return this.stationPrinters.get(key) || this.printer;
  }

  /**
   * Ritorna il device cassa piu appropriato basandosi su criteri.
   * Logica: id esatto > capability match > fallback default.
   * @param {{ id?: string, capability?: string, accepted_method?: string }} criteria
   * @returns {Object}
   */
  getCashDevice({ id, capability, accepted_method } = {}) {
    // Lookup esatto per id/key
    if (id) {
      const exact = this.cashDevices.get(id);
      if (exact) return exact;
    }
    // Lookup per capability + accepted_method
    for (const [, device] of this.cashDevices) {
      const caps = device.__capabilities || {};
      if (capability && !caps[capability]) continue;
      if (accepted_method) {
        const methods = caps.accepted_methods || [];
        if (!methods.includes(accepted_method)) continue;
      }
      return device;
    }
    // Fallback: default payment o printer
    return this.payment || this.printer;
  }

  /**
   * Reload: dispose vecchi, ricrea da nuovi target rows. Single-flight.
   * @param {Array} targetRows
   */
  async reload(targetRows) {
    if (this._reloading) {
      log.debug('reload: single-flight skip');
      return;
    }
    this._reloading = true;
    try {
      // Dispose vecchi station + cash drivers
      await this._disposeMap(this.stationPrinters);
      await this._disposeMap(this.cashDevices);
      this.stationPrinters = new Map();
      this.cashDevices = new Map();
      // Ricarica
      await this.loadFromTargets(targetRows);
    } finally {
      this._reloading = false;
    }
  }

  async _tryInit(category, instance) {
    try {
      await instance.init();
      return instance;
    } catch (err) {
      log.warn(
        { category, driver: instance.name, err: err.message },
        'Driver init fallita: passo in modalita degradata',
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

  /**
   * Load a driver by name from a registry with explicit options.
   * @param {string} name
   * @param {Object} registry - PRINTERS or PAYMENTS map
   * @param {Object} opts - driver constructor options
   * @returns {Object} driver instance (not yet init'd)
   */
  _loadByName(name, registry, opts) {
    const factory = registry[name];
    if (!factory) {
      throw new AppError(
        CODES.DRIVER_UNAVAILABLE,
        `Driver "${name}" non disponibile`,
      );
    }
    const Klass = factory();
    return new Klass(opts);
  }

  /**
   * Build driver options from a printer_targets row.
   */
  _buildDriverOpts(row) {
    const opts = {};
    if (row.host) opts.host = row.host;
    if (row.port) opts.port = Number(row.port);
    // Merge extra options from options_json
    let extra = {};
    if (row.options_json) {
      try {
        extra = typeof row.options_json === 'string' ? JSON.parse(row.options_json) : row.options_json;
      } catch (_) {}
    }
    return { ...extra, ...opts };
  }

  /**
   * Parse capabilities_json string into object.
   */
  _parseCapabilities(capJson) {
    if (!capJson) return {};
    try {
      return typeof capJson === 'string' ? JSON.parse(capJson) : capJson;
    } catch (_) {
      return {};
    }
  }

  async _disposeMap(map) {
    for (const [key, driver] of map) {
      try {
        await driver?.dispose?.();
      } catch (e) {
        log.warn({ key, err: e.message }, 'Errore dispose driver (targets)');
      }
    }
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
    await this._disposeMap(this.stationPrinters);
    await this._disposeMap(this.cashDevices);
  }

  async status() {
    const [p, q] = await Promise.all([
      this.printer?.getStatus?.() || { online: false },
      this.payment?.getStatus?.() || { online: false },
    ]);

    // Stations status
    const stations = {};
    for (const [key, driver] of this.stationPrinters) {
      try {
        stations[key] = await driver.getStatus();
      } catch (e) {
        stations[key] = { online: false, error: e.message };
      }
    }

    // Cash devices status
    const cash_devices = {};
    for (const [key, driver] of this.cashDevices) {
      try {
        cash_devices[key] = await driver.getStatus();
        cash_devices[key].capabilities = driver.__capabilities || {};
      } catch (e) {
        cash_devices[key] = { online: false, error: e.message };
      }
    }

    return { printer: p, payment: q, stations, cash_devices };
  }
}

/**
 * Wrappa un driver che ha fallito init() in un proxy che:
 *  - getStatus()           -> { online: false, error: <init-err>, degraded: true }
 *  - dispose()             -> no-op
 *  - qualsiasi altra op    -> throw DRIVER_UNAVAILABLE con il motivo originale
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
  for (const m of ['init', 'charge', 'refund', 'printReceipt', 'printFiscalReceipt', 'printKitchenTicket', 'inquiry']) {
    proxy[m] = async () => {
      throw new AppError(
        CODES.DRIVER_UNAVAILABLE,
        `Driver "${instance.name}" non configurato/raggiungibile: ${reason}`,
      );
    };
  }
  return proxy;
}

module.exports = { DriverRegistry, makeDegradedProxy };
