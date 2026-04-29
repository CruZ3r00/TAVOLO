'use strict';

const net = require('net');
const { PaymentDriver } = require('./base');
const { AppError, CODES } = require('../../utils/errors');
const { getLogger } = require('../../utils/logger');

const log = getLogger('drivers/payment/generic-ecr');

/**
 * Generic ECR payment driver — protocollo OPI (Open Payment Initiative).
 *
 * Standard de-facto in Italia: usato da Banca Sella, Nexi/SIA, Worldline,
 * Adyen, SatisPay enterprise. Niente SDK proprietario, solo TCP + XML.
 *
 * Frame: 4-byte ASCII length prefix + UTF-8 XML body.
 *
 *   "0123<?xml...?><ServiceRequest .../>"
 *
 * Comandi supportati:
 *  - Payment (sale/charge)
 *  - ReversePayment (refund)
 *  - Diagnosis (status/echo)
 *  - Login (init handshake, opzionale)
 *
 * Configurazione (config.drivers['generic-ecr']):
 *   { host: '192.168.1.50', port: 6000, workstationId: 'POS01', popId: '1',
 *     terminalId: 'T01', timeoutMs: 30000, currency: 978 }
 */
class GenericEcrDriver extends PaymentDriver {
  constructor(options = {}) {
    super(options);
    this.name = 'generic-ecr';
    this.host = options.host;
    this.port = options.port || 6000;
    this.workstationId = options.workstationId || 'POS01';
    this.popId = options.popId || '1';
    this.applicationSender = options.applicationSender || 'pos-rt-service';
    this.terminalId = options.terminalId || null;
    this.currency = options.currency || 978; // ISO 4217 numeric, EUR = 978
    this.timeoutMs = options.timeoutMs || 30_000;
    this.initialized = false;
    this._idempotencyCache = new Map(); // idempotencyKey -> outcome (max 200 entries)
    this._lastDiagnosis = null;
    this._reqCounter = 0;
  }

  async init() {
    if (!this.host) {
      throw new AppError(
        CODES.DRIVER_UNAVAILABLE,
        'generic-ecr: opzione `host` mancante (IP del terminale POS)',
      );
    }
    // Best-effort: prova un Diagnosis. Se il device è offline non blocchiamo
    // la startup (init è anche chiamata in fase di pairing).
    try {
      await this._diagnosis();
      log.info({ host: this.host, port: this.port }, 'generic-ecr: terminale raggiungibile');
    } catch (err) {
      log.warn({ err: err.message, host: this.host, port: this.port }, 'generic-ecr: diagnosis fallita all\'init (verifica all\'uso)');
    }
    this.initialized = true;
  }

  _nextRequestId() {
    this._reqCounter = (this._reqCounter + 1) % 1_000_000_000;
    return String(Date.now()).slice(-6) + String(this._reqCounter).padStart(4, '0');
  }

  async charge({ amount, currency = 'EUR', idempotencyKey, orderRef }) {
    if (!this.initialized) await this.init();
    if (idempotencyKey && this._idempotencyCache.has(idempotencyKey)) {
      return this._idempotencyCache.get(idempotencyKey);
    }
    const minor = Math.round(Number(amount) * 100); // EUR → cent
    if (!Number.isFinite(minor) || minor <= 0) {
      throw new AppError(CODES.INVALID_PAYLOAD, `generic-ecr: amount non valido (${amount})`);
    }
    const requestId = idempotencyKey || this._nextRequestId();
    const xml = this._buildPaymentXml({ requestId, minor, currency, orderRef });
    const respXml = await this._sendFramed(xml);
    const outcome = this._parsePaymentResponse(respXml, { requestId, minor, currency });
    if (!outcome.success) {
      throw new AppError(
        outcome.code === '04' ? CODES.PAYMENT_DECLINED : CODES.DRIVER_ERROR,
        `generic-ecr: ${outcome.message || 'pagamento non autorizzato'}`,
        { details: outcome },
      );
    }
    if (idempotencyKey) this._cacheIdempotency(idempotencyKey, outcome);
    return outcome;
  }

  async refund({ transactionId, amount }) {
    if (!this.initialized) await this.init();
    const minor = Math.round(Number(amount) * 100);
    const requestId = this._nextRequestId();
    const xml = this._buildRefundXml({ requestId, minor, originalTransactionId: transactionId });
    const respXml = await this._sendFramed(xml);
    const outcome = this._parsePaymentResponse(respXml, { requestId, minor, currency: 'EUR' });
    if (!outcome.success) {
      throw new AppError(
        CODES.DRIVER_ERROR,
        `generic-ecr refund: ${outcome.message || 'rifiutato'}`,
        { details: outcome },
      );
    }
    return {
      success: true,
      refundId: outcome.transactionId,
      transactionId,
      amount,
      timestamp: outcome.timestamp,
      driver: this.name,
    };
  }

  async getStatus() {
    try {
      await this._diagnosis();
      return { online: true, name: this.name, host: this.host, port: this.port, terminalId: this.terminalId };
    } catch (err) {
      return { online: false, name: this.name, host: this.host, port: this.port, error: err.message };
    }
  }

  async _diagnosis() {
    const requestId = this._nextRequestId();
    const xml = this._buildDiagnosisXml({ requestId });
    const respXml = await this._sendFramed(xml, { timeoutMs: 5_000 });
    this._lastDiagnosis = { ts: Date.now(), raw: respXml };
    const result = this._extractAttr(respXml, 'OverallResult');
    if (result !== 'Success') {
      throw new AppError(CODES.DRIVER_ERROR, `generic-ecr Diagnosis: ${result}`);
    }
    return true;
  }

  _cacheIdempotency(key, outcome) {
    this._idempotencyCache.set(key, outcome);
    if (this._idempotencyCache.size > 200) {
      const firstKey = this._idempotencyCache.keys().next().value;
      this._idempotencyCache.delete(firstKey);
    }
  }

  // ─── XML builders ────────────────────────────────────────────────────────

  _buildPaymentXml({ requestId, minor, currency: _ignored, orderRef }) {
    const ts = new Date().toISOString().replace(/\.\d{3}Z$/, '');
    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<ServiceRequest RequestType="Payment" RequestID="${esc(requestId)}" ` +
      `WorkstationID="${esc(this.workstationId)}" ApplicationSender="${esc(this.applicationSender)}" ` +
      `POPID="${esc(this.popId)}">` +
      `<POSdata><POSTimeStamp>${ts}</POSTimeStamp>` +
      (orderRef ? `<TransNum>${esc(String(orderRef))}</TransNum>` : '') +
      `</POSdata>` +
      `<TotalAmount Currency="${this.currency}">${minor}</TotalAmount>` +
      `</ServiceRequest>`
    );
  }

  _buildRefundXml({ requestId, minor, originalTransactionId }) {
    const ts = new Date().toISOString().replace(/\.\d{3}Z$/, '');
    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<ServiceRequest RequestType="ReversePayment" RequestID="${esc(requestId)}" ` +
      `WorkstationID="${esc(this.workstationId)}" ApplicationSender="${esc(this.applicationSender)}" ` +
      `POPID="${esc(this.popId)}">` +
      `<POSdata><POSTimeStamp>${ts}</POSTimeStamp>` +
      (originalTransactionId ? `<OriginalTransactionID>${esc(originalTransactionId)}</OriginalTransactionID>` : '') +
      `</POSdata>` +
      `<TotalAmount Currency="${this.currency}">${minor}</TotalAmount>` +
      `</ServiceRequest>`
    );
  }

  _buildDiagnosisXml({ requestId }) {
    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<ServiceRequest RequestType="Diagnosis" RequestID="${esc(requestId)}" ` +
      `WorkstationID="${esc(this.workstationId)}" ApplicationSender="${esc(this.applicationSender)}" ` +
      `POPID="${esc(this.popId)}"/>`
    );
  }

  // ─── XML parsing ─────────────────────────────────────────────────────────

  _parsePaymentResponse(xml, { requestId, minor, currency }) {
    const overall = this._extractAttr(xml, 'OverallResult');
    const success = overall === 'Success';
    const txId = this._extractAttr(xml, 'TransactionID') ||
      this._extractTagText(xml, 'TransactionID') ||
      this._extractAttr(xml, 'ApprovalCode') || null;
    const errorMsg =
      this._extractTagText(xml, 'ErrorMessage') ||
      this._extractAttr(xml, 'OverallResult') ||
      null;
    const code = this._extractAttr(xml, 'AuthorisationResult') || (success ? '00' : '99');
    return {
      success,
      transactionId: txId || `ECR-${requestId}`,
      amount: minor / 100,
      currency,
      orderRef: null,
      timestamp: new Date().toISOString(),
      driver: this.name,
      code,
      message: success ? 'OK' : errorMsg,
      raw: xml,
    };
  }

  _extractAttr(xml, attrName) {
    const re = new RegExp(`${attrName}="([^"]*)"`);
    const m = xml.match(re);
    return m ? m[1] : null;
  }

  _extractTagText(xml, tagName) {
    const re = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`);
    const m = xml.match(re);
    return m ? m[1] : null;
  }

  // ─── TCP framing ─────────────────────────────────────────────────────────

  /**
   * Frame: 4-byte ASCII length (zero-padded) + UTF-8 body.
   * Esempio: "0089<?xml ...?><ServiceRequest .../>"
   */
  _sendFramed(xmlBody, { timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      const tmo = timeoutMs ?? this.timeoutMs;
      const body = Buffer.from(xmlBody, 'utf8');
      const len = String(body.length).padStart(4, '0');
      if (body.length > 9999) {
        return reject(new AppError(CODES.INVALID_PAYLOAD, 'generic-ecr: body XML troppo grande (>9999 byte)'));
      }
      const frame = Buffer.concat([Buffer.from(len, 'ascii'), body]);

      const sock = net.createConnection({ host: this.host, port: this.port });
      let buf = Buffer.alloc(0);
      let resolved = false;
      const finish = (err, res) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        try { sock.destroy(); } catch (_) {}
        err ? reject(err) : resolve(res);
      };
      const timer = setTimeout(
        () => finish(new AppError(CODES.DRIVER_TIMEOUT, `generic-ecr timeout dopo ${tmo}ms`)),
        tmo,
      );

      sock.on('connect', () => {
        sock.write(frame);
      });
      sock.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        if (buf.length >= 4) {
          const expected = parseInt(buf.subarray(0, 4).toString('ascii'), 10);
          if (Number.isFinite(expected) && buf.length >= 4 + expected) {
            const xml = buf.subarray(4, 4 + expected).toString('utf8');
            finish(null, xml);
          }
        }
      });
      sock.on('error', (err) => finish(new AppError(CODES.DRIVER_UNAVAILABLE, `generic-ecr socket: ${err.message}`, { cause: err })));
      sock.on('end', () => {
        if (!resolved) finish(new AppError(CODES.DRIVER_ERROR, 'generic-ecr: connessione chiusa prima della risposta'));
      });
    });
  }

  async dispose() {
    this._idempotencyCache.clear();
  }
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { GenericEcrDriver };
