'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { PrinterDriver } = require('./base');
const { AppError, CODES } = require('../../utils/errors');
const { getLogger } = require('../../utils/logger');

const log = getLogger('drivers/printer/epson-fpmate');

/**
 * Epson FPMate driver — Registratore Telematico Epson FP-90III, FP-81II,
 * FP-T20III ecc. via interfaccia FPMate (XML su HTTP, porta 80 di default).
 *
 * Endpoint:  http://<host>/cgi-bin/fpmate.cgi
 * Body:      SOAP envelope con tag <printerFiscalReceipt> / <printerCommand>.
 * Response:  XML con `<response success="true|false" code="..." status="...">`.
 *
 * Configurazione (config.drivers['epson-fpmate']):
 *   { host, port, https, username, password, timeoutMs, operator, vatGroup }
 *     - operator: codice operatore (default "1")
 *     - vatGroup: reparto/gruppo IVA per ogni rec item (default "1")
 *     - https: bool, disabilitato di default (l'RT in LAN non ha cert valido)
 *
 * Comandi supportati:
 *   - printReceipt        → scontrino non fiscale (printNonFiscal)
 *   - printFiscalReceipt  → scontrino fiscale completo
 *   - getStatus           → printerStatus / queryPrinterStatus
 */
class EpsonFpMateDriver extends PrinterDriver {
  constructor(options = {}) {
    super(options);
    this.name = 'epson-fpmate';
    this.host = options.host;
    this.port = options.port || 80;
    this.useHttps = !!options.https;
    this.username = options.username || null;
    this.password = options.password || null;
    this.timeoutMs = options.timeoutMs || 30_000;
    this.operator = String(options.operator || '1');
    this.vatGroup = String(options.vatGroup || '1');
    this.path = options.path || '/cgi-bin/fpmate.cgi';
    this.initialized = false;
  }

  async init() {
    if (!this.host) {
      throw new AppError(CODES.DRIVER_UNAVAILABLE, 'epson-fpmate: opzione `host` mancante');
    }
    try {
      await this.getStatus();
      log.info({ host: this.host, port: this.port }, 'epson-fpmate: dispositivo raggiungibile');
    } catch (err) {
      log.warn({ err: err.message }, 'epson-fpmate: status fallito all\'init');
    }
    this.initialized = true;
  }

  async printReceipt(data) {
    if (!this.initialized) await this.init();
    const xml = this._buildNonFiscalXml(data);
    const resp = await this._post(xml);
    return this._parseResponse(resp, { fiscal: false });
  }

  async printFiscalReceipt(data) {
    if (!this.initialized) await this.init();
    const xml = this._buildFiscalXml(data);
    const resp = await this._post(xml);
    return this._parseResponse(resp, { fiscal: true });
  }

  async getStatus() {
    const xml = this._wrapEnvelope(
      `<printerCommand><queryPrinterStatus statusType="1"/></printerCommand>`,
    );
    try {
      const resp = await this._post(xml, { timeoutMs: 5_000 });
      const success = /success="true"/.test(resp);
      const code = (resp.match(/code="(\d+)"/) || [])[1] || null;
      return { online: success, name: this.name, host: this.host, port: this.port, statusCode: code };
    } catch (err) {
      return { online: false, name: this.name, host: this.host, port: this.port, error: err.message };
    }
  }

  // ─── XML builders ────────────────────────────────────────────────────────

  _buildFiscalXml(data) {
    const items = Array.isArray(data?.items) ? data.items : [];
    const lines = items
      .map((it) => {
        const desc = esc(String(it.name || it.description || 'voce').slice(0, 38));
        const qty = String(it.quantity || 1);
        // unitPrice in cent (FPMate attende interi senza decimali)
        const unitPrice = Math.round(Number(it.unit_price || it.price || 0) * 100);
        const dept = String(it.vatGroup || it.department || this.vatGroup);
        return `<printRecItem description="${desc}" quantity="${qty}" unitPrice="${unitPrice}" department="${dept}" justification="0"/>`;
      })
      .join('');

    const total = Math.round(Number(data?.total || 0) * 100);
    const paymentDescription = esc(String(data?.payment_description || data?.payment_method || 'Pagamento').slice(0, 38));
    // paymentType: 0=Contanti, 1=Assegno, 2=Carta di credito, 3=Buoni pasto, 4=Altro
    const paymentType = String(data?.payment_type ?? this._mapPaymentType(data?.payment_method) ?? 0);

    const inner =
      `<printerFiscalReceipt>` +
      `<beginFiscalReceipt operator="${esc(this.operator)}"/>` +
      lines +
      `<printRecTotal payment="${total}" description="${paymentDescription}" paymentType="${paymentType}"/>` +
      `<endFiscalReceipt/>` +
      `</printerFiscalReceipt>`;
    return this._wrapEnvelope(inner);
  }

  _buildNonFiscalXml(data) {
    const items = Array.isArray(data?.items) ? data.items : [];
    const printLines = items
      .map((it) => {
        const desc = esc(String(it.name || it.description || 'voce').slice(0, 46));
        const qty = it.quantity || 1;
        const unit = Number(it.unit_price || it.price || 0).toFixed(2);
        return `<printNormal operator="${esc(this.operator)}" data="${desc}  ${qty}x ${unit}" font="1"/>`;
      })
      .join('');

    const totalLine = data?.total
      ? `<printNormal operator="${esc(this.operator)}" data="TOTALE: ${Number(data.total).toFixed(2)} EUR" font="2"/>`
      : '';

    const inner =
      `<printerNonFiscal>` +
      `<beginNonFiscal operator="${esc(this.operator)}"/>` +
      printLines +
      totalLine +
      `<endNonFiscal/>` +
      `</printerNonFiscal>`;
    return this._wrapEnvelope(inner);
  }

  _wrapEnvelope(inner) {
    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">` +
      `<s:Body>${inner}</s:Body>` +
      `</s:Envelope>`
    );
  }

  _mapPaymentType(method) {
    if (!method) return 0;
    const m = String(method).toLowerCase();
    if (m === 'cash' || m === 'contanti') return 0;
    if (m === 'card' || m === 'pos' || m === 'credit_card') return 2;
    if (m === 'meal_voucher' || m === 'ticket') return 3;
    return 4;
  }

  // ─── response parsing ────────────────────────────────────────────────────

  _parseResponse(xml, { fiscal }) {
    const success = /success="true"/.test(xml);
    if (!success) {
      const code = (xml.match(/code="(\d+)"/) || [])[1] || '999';
      const status = (xml.match(/status="([^"]*)"/) || [])[1] || 'errore RT';
      throw new AppError(CODES.DRIVER_ERROR, `epson-fpmate: ${status} (code=${code})`, {
        details: { code, status, raw: xml.slice(0, 500) },
      });
    }
    const fiscalNo = (xml.match(/<receiptNumber>(\d+)<\/receiptNumber>/) || [])[1] ||
      (xml.match(/fiscalReceiptNumber="(\d+)"/) || [])[1] || null;
    const zRepNo = (xml.match(/zRepNumber="(\d+)"/) || [])[1] || null;
    return {
      success: true,
      receipt_no: fiscalNo || `EP-${Date.now()}`,
      fiscal,
      z_report_no: zRepNo,
      timestamp: new Date().toISOString(),
      driver: this.name,
    };
  }

  // ─── HTTP transport ──────────────────────────────────────────────────────

  _post(body, { timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      const tmo = timeoutMs ?? this.timeoutMs;
      const url = new URL(`${this.useHttps ? 'https' : 'http'}://${this.host}:${this.port}${this.path}`);
      const lib = this.useHttps ? https : http;
      const headers = {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(body, 'utf8'),
        'User-Agent': 'pos-rt-service/1.0',
      };
      if (this.username) {
        headers['Authorization'] =
          'Basic ' + Buffer.from(`${this.username}:${this.password || ''}`).toString('base64');
      }
      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port || (this.useHttps ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers,
          rejectUnauthorized: false, // RT in LAN: cert spesso self-signed o assente
          timeout: tmo,
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            if (res.statusCode >= 400) {
              return reject(new AppError(CODES.DRIVER_ERROR, `epson-fpmate HTTP ${res.statusCode}`, { details: { body: text.slice(0, 500) } }));
            }
            resolve(text);
          });
        },
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new AppError(CODES.DRIVER_TIMEOUT, `epson-fpmate timeout ${tmo}ms`));
      });
      req.on('error', (err) => reject(new AppError(CODES.DRIVER_UNAVAILABLE, `epson-fpmate: ${err.message}`, { cause: err })));
      req.write(body, 'utf8');
      req.end();
    });
  }

  async dispose() {
    /* no-op */
  }
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { EpsonFpMateDriver };
