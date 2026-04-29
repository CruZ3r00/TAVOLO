'use strict';

const { PaymentDriver } = require('./base');
const { AppError, CODES } = require('../../utils/errors');
const { getLogger } = require('../../utils/logger');

const log = getLogger('drivers/payment/escpos-bt');

/**
 * ESC/POS-BT payment driver — terminale POS pairato via Bluetooth che espone
 * un Virtual COM port (Windows BT classico, Linux rfcomm, macOS /dev/cu.*).
 *
 * Protocollo: comandi ESC + opcode in ASCII, risposta line-terminated.
 *  Esempio (subset comune):
 *    ESC 'P' AMT12 CR LF        → request payment, amount 12 cifre BCD-as-text
 *    ESC 'R' AMT12 ID12 CR LF   → refund
 *    ESC 'S' CR LF              → status
 *  Risposta:
 *    "OK <txid> <amount>" / "KO <code> <msg>"
 *
 * Configurazione (config.drivers['escpos-bt']):
 *   { path: 'COM4' | '/dev/rfcomm0', baudRate: 9600, timeoutMs: 30000 }
 *
 * Dipendenza opzionale: `serialport`. Se non installata, init() lancia
 * NOT_IMPLEMENTED con istruzione per installarla. Manteniamo il modulo
 * lazy-loaded per non gonfiare il bundle pkg quando il driver non è in uso.
 */
class EscPosBtDriver extends PaymentDriver {
  constructor(options = {}) {
    super(options);
    this.name = 'escpos-bt';
    this.path = options.path;
    this.baudRate = options.baudRate || 9600;
    this.timeoutMs = options.timeoutMs || 30_000;
    this.initialized = false;
    this._port = null;
    this._lock = Promise.resolve();
    this._idempotencyCache = new Map();
  }

  async init() {
    if (!this.path) {
      throw new AppError(
        CODES.DRIVER_UNAVAILABLE,
        'escpos-bt: opzione `path` mancante (es. "COM4" o "/dev/rfcomm0")',
      );
    }
    let SerialPortMod;
    try {
      SerialPortMod = require('serialport');
    } catch (err) {
      throw new AppError(
        CODES.NOT_IMPLEMENTED,
        'escpos-bt: pacchetto `serialport` non installato. Aggiungere optionalDependencies o `npm i serialport`.',
        { cause: err },
      );
    }
    const SerialPort = SerialPortMod.SerialPort || SerialPortMod;
    try {
      this._port = new SerialPort({ path: this.path, baudRate: this.baudRate, autoOpen: false });
    } catch (err) {
      throw new AppError(CODES.DRIVER_UNAVAILABLE, `escpos-bt: SerialPort init fallita: ${err.message}`, { cause: err });
    }
    await this._open();
    this.initialized = true;
    log.info({ path: this.path, baudRate: this.baudRate }, 'escpos-bt: porta aperta');
  }

  _open() {
    return new Promise((resolve, reject) => {
      this._port.open((err) => (err ? reject(new AppError(CODES.DRIVER_UNAVAILABLE, `escpos-bt open: ${err.message}`)) : resolve()));
    });
  }

  async charge({ amount, currency = 'EUR', idempotencyKey, orderRef }) {
    if (!this.initialized) await this.init();
    if (idempotencyKey && this._idempotencyCache.has(idempotencyKey)) {
      return this._idempotencyCache.get(idempotencyKey);
    }
    const minor = Math.round(Number(amount) * 100);
    if (!Number.isFinite(minor) || minor <= 0) {
      throw new AppError(CODES.INVALID_PAYLOAD, `escpos-bt: amount non valido (${amount})`);
    }
    const cmd = Buffer.concat([
      Buffer.from([0x1b, 0x50]), // ESC P
      Buffer.from(String(minor).padStart(12, '0'), 'ascii'),
      Buffer.from([0x0d, 0x0a]),
    ]);
    const resp = await this._exchange(cmd);
    const parsed = this._parseLine(resp);
    if (!parsed.ok) {
      throw new AppError(
        parsed.code === '04' ? CODES.PAYMENT_DECLINED : CODES.DRIVER_ERROR,
        `escpos-bt: ${parsed.message}`,
        { details: parsed },
      );
    }
    const outcome = {
      success: true,
      transactionId: parsed.txId || `BT-${Date.now()}`,
      amount: minor / 100,
      currency,
      orderRef: orderRef || null,
      timestamp: new Date().toISOString(),
      driver: this.name,
      code: parsed.code || '00',
      message: 'OK',
    };
    if (idempotencyKey) this._cacheIdempotency(idempotencyKey, outcome);
    return outcome;
  }

  async refund({ transactionId, amount }) {
    if (!this.initialized) await this.init();
    const minor = Math.round(Number(amount) * 100);
    const id = String(transactionId || '').slice(0, 12).padEnd(12, ' ');
    const cmd = Buffer.concat([
      Buffer.from([0x1b, 0x52]), // ESC R
      Buffer.from(String(minor).padStart(12, '0'), 'ascii'),
      Buffer.from(id, 'ascii'),
      Buffer.from([0x0d, 0x0a]),
    ]);
    const resp = await this._exchange(cmd);
    const parsed = this._parseLine(resp);
    if (!parsed.ok) {
      throw new AppError(CODES.DRIVER_ERROR, `escpos-bt refund: ${parsed.message}`, { details: parsed });
    }
    return {
      success: true,
      refundId: parsed.txId || `BT-R-${Date.now()}`,
      transactionId,
      amount,
      timestamp: new Date().toISOString(),
      driver: this.name,
    };
  }

  async getStatus() {
    if (!this.initialized) {
      try { await this.init(); } catch (err) {
        return { online: false, name: this.name, path: this.path, error: err.message };
      }
    }
    try {
      const cmd = Buffer.concat([Buffer.from([0x1b, 0x53]), Buffer.from([0x0d, 0x0a])]);
      const resp = await this._exchange(cmd, { timeoutMs: 3_000 });
      const parsed = this._parseLine(resp);
      return { online: parsed.ok, name: this.name, path: this.path, message: parsed.message };
    } catch (err) {
      return { online: false, name: this.name, path: this.path, error: err.message };
    }
  }

  _parseLine(line) {
    const text = line.toString('ascii').trim();
    const m = text.match(/^(OK|KO)\s+([\S]+)?\s*(.*)$/);
    if (!m) return { ok: false, code: '99', message: text || 'risposta vuota' };
    const ok = m[1] === 'OK';
    const tail = m[2] || '';
    const rest = m[3] || '';
    if (ok) return { ok: true, txId: tail, code: '00', message: rest };
    return { ok: false, code: tail, message: rest };
  }

  // Serializza gli scambi: una sola request alla volta sulla porta seriale.
  _exchange(cmd, { timeoutMs } = {}) {
    const job = () => this._exchangeNow(cmd, { timeoutMs });
    const next = this._lock.then(job, job);
    this._lock = next.then(() => undefined, () => undefined);
    return next;
  }

  _exchangeNow(cmd, { timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      const tmo = timeoutMs ?? this.timeoutMs;
      let buf = Buffer.alloc(0);
      let resolved = false;
      const finish = (err, res) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        this._port.removeListener('data', onData);
        this._port.removeListener('error', onErr);
        err ? reject(err) : resolve(res);
      };
      const timer = setTimeout(
        () => finish(new AppError(CODES.DRIVER_TIMEOUT, `escpos-bt timeout ${tmo}ms`)),
        tmo,
      );
      const onData = (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        const idx = buf.indexOf(0x0a);
        if (idx >= 0) finish(null, buf.subarray(0, idx));
      };
      const onErr = (err) => finish(new AppError(CODES.DRIVER_ERROR, `escpos-bt: ${err.message}`, { cause: err }));
      this._port.on('data', onData);
      this._port.on('error', onErr);
      this._port.write(cmd, (err) => err && finish(new AppError(CODES.DRIVER_ERROR, `escpos-bt write: ${err.message}`)));
    });
  }

  _cacheIdempotency(key, outcome) {
    this._idempotencyCache.set(key, outcome);
    if (this._idempotencyCache.size > 200) {
      this._idempotencyCache.delete(this._idempotencyCache.keys().next().value);
    }
  }

  async dispose() {
    this._idempotencyCache.clear();
    if (this._port && this._port.isOpen) {
      await new Promise((resolve) => this._port.close(() => resolve()));
    }
  }
}

module.exports = { EscPosBtDriver };
