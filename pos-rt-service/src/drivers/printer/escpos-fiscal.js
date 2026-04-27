'use strict';

const net = require('net');
const { PrinterDriver } = require('./base');
const { AppError, CODES } = require('../../utils/errors');
const { getLogger } = require('../../utils/logger');

const log = getLogger('drivers/printer/escpos-fiscal');

/**
 * ESC/POS-fiscal generic driver — fallback per RT che parlano un subset
 * ESC/POS esteso con opcode fiscali (es. cloni di Olivetti, Diebold-Nixdorf,
 * RCH PRINT! F low-end, alcune versioni di Brother / Star).
 *
 * Non è uno standard formale: ogni produttore espone un dialetto leggermente
 * diverso, ma condividono la struttura:
 *   ESC '|' '<opcode>' <args separated by ETB> LF
 *
 * dove ETB = 0x17. Usato come fallback quando l'utente non ha Epson FPMate
 * né Custom XON.
 *
 * Configurazione (config.drivers['escpos-fiscal']):
 *   { host, port, timeoutMs, encoding (default 'cp858'), operator,
 *     line_format (default 'standard') }
 *
 * Limiti: nessuna garanzia di compatibilità senza test sul device specifico.
 * I codici esattamente compatibili sono definiti nei manuali del singolo
 * produttore. Per nuovi device, capire la mappatura dei comandi e
 * eventualmente forkare in un nuovo driver dedicato.
 */
const ESC = 0x1b;
const ETB = 0x17;
const LF = 0x0a;
const CR = 0x0d;

class EscposFiscalDriver extends PrinterDriver {
  constructor(options = {}) {
    super(options);
    this.name = 'escpos-fiscal';
    this.host = options.host;
    this.port = options.port || 9100;
    this.timeoutMs = options.timeoutMs || 30_000;
    this.operator = String(options.operator || '1');
    this.initialized = false;
    this._lock = Promise.resolve();
  }

  async init() {
    if (!this.host) {
      throw new AppError(CODES.DRIVER_UNAVAILABLE, 'escpos-fiscal: opzione `host` mancante');
    }
    try {
      await this.getStatus();
      log.info({ host: this.host, port: this.port }, 'escpos-fiscal: dispositivo raggiungibile');
    } catch (err) {
      log.warn({ err: err.message }, 'escpos-fiscal: status fallito all\'init');
    }
    this.initialized = true;
  }

  async printReceipt(data) {
    if (!this.initialized) await this.init();
    const lines = (Array.isArray(data?.items) ? data.items : []).map((it) =>
      `${(it.name || it.description || 'voce').slice(0, 38)}  ${it.quantity || 1}x ${Number(it.unit_price || it.price || 0).toFixed(2)}`,
    );
    if (data?.total != null) lines.push(`TOTALE: ${Number(data.total).toFixed(2)} EUR`);
    const text = lines.join('\n');
    const cmd = this._cmd('N', [text.slice(0, 1024)]);
    const resp = await this._send(cmd);
    return this._parseOutcome(resp, { fiscal: false });
  }

  async printFiscalReceipt(data) {
    if (!this.initialized) await this.init();
    const items = Array.isArray(data?.items) ? data.items : [];
    if (items.length === 0) {
      throw new AppError(CODES.INVALID_PAYLOAD, 'escpos-fiscal: scontrino senza voci');
    }
    const cmds = [];
    cmds.push(this._cmd('A', [this.operator])); // Apri scontrino fiscale
    for (const it of items) {
      const desc = (it.name || it.description || 'voce').slice(0, 38);
      const cents = Math.round(Number(it.unit_price || it.price || 0) * 100);
      const qty = it.quantity || 1;
      const dept = String(it.vatGroup || it.department || '1');
      cmds.push(this._cmd('I', [desc, String(cents), String(qty), dept]));
    }
    const totalCents = Math.round(Number(data?.total || 0) * 100);
    const payType = data?.payment_type ?? this._mapPaymentType(data?.payment_method);
    cmds.push(this._cmd('T', [String(totalCents), String(payType)]));
    cmds.push(this._cmd('C', []));

    const resp = await this._send(Buffer.concat(cmds));
    return this._parseOutcome(resp, { fiscal: true });
  }

  async getStatus() {
    try {
      const resp = await this._send(this._cmd('S', []), { timeoutMs: 3_000 });
      const ok = resp.length > 0 && resp[0] !== 0x15; // NAK
      return { online: ok, name: this.name, host: this.host, port: this.port };
    } catch (err) {
      return { online: false, name: this.name, host: this.host, port: this.port, error: err.message };
    }
  }

  _mapPaymentType(method) {
    if (!method) return 1;
    const m = String(method).toLowerCase();
    if (m === 'cash' || m === 'contanti') return 1;
    if (m === 'card' || m === 'pos' || m === 'credit_card') return 2;
    if (m === 'meal_voucher' || m === 'ticket') return 4;
    return 5;
  }

  _cmd(opcode, args) {
    const sep = Buffer.from([ETB]);
    const argsBuf = args.length > 0 ? Buffer.concat(args.map((a) => Buffer.from(String(a), 'utf8')).reduce((acc, cur) => {
      if (acc.length === 0) return [cur];
      acc.push(sep);
      acc.push(cur);
      return acc;
    }, [])) : Buffer.alloc(0);
    return Buffer.concat([
      Buffer.from([ESC, 0x7c]), // ESC '|'
      Buffer.from(opcode, 'ascii'),
      argsBuf,
      Buffer.from([LF]),
    ]);
  }

  _parseOutcome(buf, { fiscal }) {
    const text = buf.toString('utf8');
    if (buf.length > 0 && buf[0] === 0x15) {
      const code = (text.match(/E(\d+)/) || [])[1] || '99';
      throw new AppError(CODES.DRIVER_ERROR, `escpos-fiscal: NAK code=${code}`, { details: { raw: text.slice(0, 200) } });
    }
    const noMatch = text.match(/N(\d+)/) || text.match(/RCN=(\d+)/);
    return {
      success: true,
      receipt_no: noMatch ? noMatch[1] : `EF-${Date.now()}`,
      fiscal,
      timestamp: new Date().toISOString(),
      driver: this.name,
    };
  }

  _send(payload, { timeoutMs } = {}) {
    const job = () => this._sendNow(payload, { timeoutMs });
    const next = this._lock.then(job, job);
    this._lock = next.then(() => undefined, () => undefined);
    return next;
  }

  _sendNow(payload, { timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      const tmo = timeoutMs ?? this.timeoutMs;
      const sock = net.createConnection({ host: this.host, port: this.port });
      let buf = Buffer.alloc(0);
      let resolved = false;
      const finish = (err, res) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        clearTimeout(quietTimer);
        try { sock.destroy(); } catch (_) {}
        err ? reject(err) : resolve(res);
      };
      const timer = setTimeout(
        () => finish(new AppError(CODES.DRIVER_TIMEOUT, `escpos-fiscal timeout ${tmo}ms`)),
        tmo,
      );
      let quietTimer = null;

      sock.on('connect', () => sock.write(payload));
      sock.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        clearTimeout(quietTimer);
        quietTimer = setTimeout(() => finish(null, buf), 200);
      });
      sock.on('error', (err) => finish(new AppError(CODES.DRIVER_UNAVAILABLE, `escpos-fiscal: ${err.message}`, { cause: err })));
      sock.on('end', () => {
        if (!resolved) {
          if (buf.length > 0) finish(null, buf);
          else finish(new AppError(CODES.DRIVER_ERROR, 'escpos-fiscal: connessione chiusa senza risposta'));
        }
      });
    });
  }

  async dispose() { /* no-op */ }
}

module.exports = { EscposFiscalDriver };
