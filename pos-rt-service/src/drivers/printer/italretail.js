'use strict';

const { PrinterDriver } = require('./base');
const { AppError, CODES } = require('../../utils/errors');
const { getLogger } = require('../../utils/logger');

const log = getLogger('drivers/printer/italretail');

/**
 * Italretail driver -- registratori telematici (RT) di Ital Retail.
 *
 * I modelli piu diffusi (Italstart, Nice, Big, Mech) sono rebrand di
 * stampanti Custom: usano il protocollo XON-XOFF su seriale RS-232 esposto via
 * convertitore TCP/IP (porta tipica 9100). Per questo motivo la strategia
 * `xon` (default) compone internamente `CustomXonDriver` con defaults
 * tarati su Italretail.
 *
 * I modelli piu recenti supportano XML 7.0 su HTTP/HTTPS/WebSocket -- la
 * strategia `xml7` e' il punto di estensione futuro (oggi throws NOT_IMPLEMENTED).
 *
 * Ported from mobile/src/drivers/italretail.ts (TypeScript -> CommonJS).
 */
class ItalretailDriver extends PrinterDriver {
  constructor(options = {}) {
    super(options);
    this.name = 'italretail';
    this.host = options.host;
    this.port = options.port || 9100;
    this.operator = String(options.operator || '1');
    this.timeoutMs = options.timeoutMs || 30_000;
    this.protocol = options.protocol || 'xon';
    this.inner = null;
  }

  async init() {
    if (!this.host) {
      throw new AppError(CODES.DRIVER_UNAVAILABLE, 'italretail: opzione host mancante');
    }
    this.inner = this._buildInner();
    await this.inner.init();
  }

  async printReceipt(data) {
    const inner = await this._ensure();
    const out = await inner.printReceipt(data);
    return { ...out, driver: this.name };
  }

  async printFiscalReceipt(data) {
    const inner = await this._ensure();
    const out = await inner.printFiscalReceipt(data);
    return { ...out, driver: this.name };
  }

  async getStatus() {
    if (!this.inner) {
      try {
        this.inner = this._buildInner();
        await this.inner.init();
      } catch (err) {
        return { online: false, name: this.name, host: this.host, error: err.message };
      }
    }
    const s = await this.inner.getStatus();
    return { ...s, name: this.name, protocol: this.protocol };
  }

  async dispose() {
    try {
      await this.inner?.dispose();
    } catch (_) {
      /* swallow */
    }
    this.inner = null;
  }

  async _ensure() {
    if (!this.inner) await this.init();
    return this.inner;
  }

  _buildInner() {
    if (this.protocol === 'xml7') {
      throw new AppError(
        CODES.NOT_IMPLEMENTED,
        'italretail: strategia XML 7.0 non ancora implementata. Usa protocol="xon" per i modelli oggi installati.',
      );
    }
    // Strategia XON (default): delega a CustomXon con defaults Italretail.
    // Lazy require per mantenere il pattern lazy-load.
    const { CustomXonDriver } = require('./custom-xon');
    return new CustomXonDriver({
      host: this.host,
      port: this.port,
      operator: this.operator,
      timeoutMs: this.timeoutMs,
    });
  }
}

module.exports = { ItalretailDriver };
