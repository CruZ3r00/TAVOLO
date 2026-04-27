'use strict';

const net = require('net');
const { PrinterDriver } = require('./base');
const { AppError, CODES } = require('../../utils/errors');
const { getLogger } = require('../../utils/logger');

const log = getLogger('drivers/printer/custom-xon');

/**
 * Custom XON driver — Custom S.p.A. Q3X / Big / K3 / Big Graph e simili,
 * via TCP socket (porta tipica 9100). Il dispositivo accetta sequenze
 * di comandi formato:
 *
 *   <ESC> '%' <opcode> <args> <ETX>
 *
 * dove `<ESC>` = 0x1B, `<ETX>` = 0x03 e gli args sono ASCII separati da pipe `|`.
 *
 * Comandi:
 *   '@'  apri scontrino fiscale
 *   '!'  voce reparto: descrizione|prezzo_cent|qta|reparto
 *   '+'  totale + pagamento: tipo_pag|importo_cent
 *   '#'  chiudi scontrino fiscale
 *   '*'  scontrino non fiscale: testo
 *   '?'  query stato
 *
 * Risposta:
 *   <STX> <PAYLOAD> <ETX> <CHK>
 *
 * Configurazione (config.drivers['custom-xon']):
 *   { host, port, timeoutMs, operator }
 */
const ESC = 0x1b;
const ETX = 0x03;
const STX = 0x02;
const ACK = 0x06;
const NAK = 0x15;

class CustomXonDriver extends PrinterDriver {
  constructor(options = {}) {
    super(options);
    this.name = 'custom-xon';
    this.host = options.host;
    this.port = options.port || 9100;
    this.timeoutMs = options.timeoutMs || 30_000;
    this.operator = String(options.operator || '1');
    this.initialized = false;
    this._lock = Promise.resolve();
  }

  async init() {
    if (!this.host) {
      throw new AppError(CODES.DRIVER_UNAVAILABLE, 'custom-xon: opzione `host` mancante');
    }
    try {
      await this.getStatus();
      log.info({ host: this.host, port: this.port }, 'custom-xon: dispositivo raggiungibile');
    } catch (err) {
      log.warn({ err: err.message }, 'custom-xon: status fallito all\'init');
    }
    this.initialized = true;
  }

  async printReceipt(data) {
    if (!this.initialized) await this.init();
    const items = Array.isArray(data?.items) ? data.items : [];
    const lines = items
      .map((it) => `${(it.name || it.description || 'voce').slice(0, 38)}  ${it.quantity || 1}x ${Number(it.unit_price || it.price || 0).toFixed(2)}`)
      .join('\n');
    const text = (data?.header || '') + '\n' + lines + '\n' + (data?.total ? `TOTALE: ${Number(data.total).toFixed(2)} EUR\n` : '') + (data?.footer || '');
    const cmd = this._frame('*', [text.slice(0, 1024)]);
    return this._exec([cmd], { fiscal: false });
  }

  async printFiscalReceipt(data) {
    if (!this.initialized) await this.init();
    const items = Array.isArray(data?.items) ? data.items : [];
    if (items.length === 0) {
      throw new AppError(CODES.INVALID_PAYLOAD, 'custom-xon: scontrino senza voci');
    }
    const total = Math.round(Number(data?.total || 0) * 100);
    const paymentType = data?.payment_type ?? this._mapPaymentType(data?.payment_method);

    const cmds = [];
    cmds.push(this._frame('@', [this.operator]));
    for (const it of items) {
      const desc = (it.name || it.description || 'voce').slice(0, 38);
      const price = Math.round(Number(it.unit_price || it.price || 0) * 100);
      const qty = it.quantity || 1;
      const dept = String(it.vatGroup || it.department || '1');
      cmds.push(this._frame('!', [desc, String(price), String(qty), dept]));
    }
    cmds.push(this._frame('+', [String(paymentType), String(total)]));
    cmds.push(this._frame('#', []));

    return this._exec(cmds, { fiscal: true });
  }

  async getStatus() {
    try {
      const resp = await this._send(this._frame('?', []), { timeoutMs: 3_000 });
      const ok = resp.length > 0 && resp[0] === STX;
      const text = resp.toString('ascii');
      return { online: ok, name: this.name, host: this.host, port: this.port, raw: text.slice(0, 200) };
    } catch (err) {
      return { online: false, name: this.name, host: this.host, port: this.port, error: err.message };
    }
  }

  _mapPaymentType(method) {
    if (!method) return 1;
    const m = String(method).toLowerCase();
    // Custom: 1=Contanti, 2=Carte, 3=Bonifico, 4=Buoni pasto, 5=Altro
    if (m === 'cash' || m === 'contanti') return 1;
    if (m === 'card' || m === 'pos' || m === 'credit_card') return 2;
    if (m === 'meal_voucher' || m === 'ticket') return 4;
    return 5;
  }

  _frame(opcode, args) {
    const body = args.join('|');
    return Buffer.concat([
      Buffer.from([ESC, 0x25]), // ESC %
      Buffer.from(opcode, 'ascii'),
      Buffer.from(body, 'ascii'),
      Buffer.from([ETX]),
    ]);
  }

  // Exec: invia comandi sequenzialmente. Se uno fallisce, tutti i successivi
  // vengono saltati e propaghiamo l'errore. Ritorna l'outcome finale.
  async _exec(cmds, { fiscal }) {
    let lastResp = null;
    let receiptNo = null;
    const bigPayload = Buffer.concat(cmds);
    lastResp = await this._send(bigPayload);
    const text = lastResp.toString('ascii');
    const m = text.match(/RC=(\d+)/);
    if (m && m[1] !== '0') {
      throw new AppError(CODES.DRIVER_ERROR, `custom-xon: errore RC=${m[1]}`, { details: { raw: text.slice(0, 500) } });
    }
    const noMatch = text.match(/SCN=(\d+)/);
    if (noMatch) receiptNo = noMatch[1];
    return {
      success: true,
      receipt_no: receiptNo || `CX-${Date.now()}`,
      fiscal,
      timestamp: new Date().toISOString(),
      driver: this.name,
    };
  }

  // Una sola conversazione TCP alla volta (RT non gestiscono multi-session).
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
        () => finish(new AppError(CODES.DRIVER_TIMEOUT, `custom-xon timeout ${tmo}ms`)),
        tmo,
      );
      // Quiet timer: dopo il primo dato ricevuto, attende 200ms di silenzio prima di chiudere.
      let quietTimer = null;

      sock.on('connect', () => sock.write(payload));
      sock.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        clearTimeout(quietTimer);
        quietTimer = setTimeout(() => finish(null, buf), 200);
      });
      sock.on('error', (err) => finish(new AppError(CODES.DRIVER_UNAVAILABLE, `custom-xon socket: ${err.message}`, { cause: err })));
      sock.on('end', () => {
        if (!resolved) {
          if (buf.length > 0) finish(null, buf);
          else finish(new AppError(CODES.DRIVER_ERROR, 'custom-xon: connessione chiusa senza risposta'));
        }
      });
    });
  }

  async dispose() { /* no-op */ }
}

module.exports = { CustomXonDriver };
