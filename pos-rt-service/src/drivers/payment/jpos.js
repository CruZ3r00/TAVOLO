'use strict';

const net = require('net');
const { PaymentDriver } = require('./base');
const { AppError, CODES } = require('../../utils/errors');
const { getLogger } = require('../../utils/logger');

const log = getLogger('drivers/payment/jpos');

/**
 * JPOS payment driver — ISO-8583 lite over TCP.
 *
 * Pensato per terminali POS in modalità ECR che parlano dialetto ISO-8583
 * (variante "POSTILION" / "ASCII MTI" subset). Niente SDK proprietari:
 * costruiamo il messaggio campo-per-campo.
 *
 * Frame: 2-byte length (big-endian) + payload ISO-8583.
 *
 * Payload:
 *   - MTI: 4 ASCII digit (es. "0200")
 *   - Bitmap: 8 byte hex (16 ASCII char) per i campi 1-64 (F1 = bit0)
 *   - Campi: in ordine, ognuno con format-specifico encoding
 *
 * Subset implementato:
 *   F3  (Processing Code, 6 ASCII digit BCD-as-text, "000000" purchase, "200000" refund)
 *   F4  (Amount, 12 ASCII digit, importo in unità minori, padded zero)
 *   F7  (Transmission Date Time, MMDDhhmmss 10 ASCII digit)
 *   F11 (STAN, 6 ASCII digit)
 *   F37 (Reference, 12 ASCII char)
 *   F39 (Response Code, 2 ASCII char) — solo in risposta
 *   F41 (Terminal ID, 8 ASCII char)
 *   F49 (Currency, 3 ASCII digit, EUR=978)
 *
 * Configurazione (config.drivers['jpos']):
 *   { host, port, terminalId, currency, timeoutMs }
 *
 * Limiti noti: nessun supporto a campi >F64 (secondo bitmap), nessun MAC
 * (F64/F128). Per terminali che richiedono MAC HMAC, ampliare con HMAC-SHA1
 * configurabile via chiave condivisa.
 */
class JposDriver extends PaymentDriver {
  constructor(options = {}) {
    super(options);
    this.name = 'jpos';
    this.host = options.host;
    this.port = options.port || 9000;
    this.terminalId = String(options.terminalId || 'POS00001').padEnd(8, ' ').slice(0, 8);
    this.currency = String(options.currency || '978').padStart(3, '0');
    this.timeoutMs = options.timeoutMs || 30_000;
    this.initialized = false;
    this._stan = Math.floor(Math.random() * 999_999); // start STAN random per evitare collisioni cross-restart
    this._idempotencyCache = new Map();
  }

  async init() {
    if (!this.host) {
      throw new AppError(CODES.DRIVER_UNAVAILABLE, 'jpos: opzione `host` mancante');
    }
    try {
      await this._netManagement();
      log.info({ host: this.host, port: this.port }, 'jpos: terminale risponde a 0800');
    } catch (err) {
      log.warn({ err: err.message }, 'jpos: net management fallita all\'init');
    }
    this.initialized = true;
  }

  _nextStan() {
    this._stan = (this._stan + 1) % 1_000_000;
    return String(this._stan).padStart(6, '0');
  }

  async charge({ amount, currency = 'EUR', idempotencyKey, orderRef }) {
    if (!this.initialized) await this.init();
    if (idempotencyKey && this._idempotencyCache.has(idempotencyKey)) {
      return this._idempotencyCache.get(idempotencyKey);
    }
    const minor = Math.round(Number(amount) * 100);
    if (!Number.isFinite(minor) || minor <= 0) {
      throw new AppError(CODES.INVALID_PAYLOAD, `jpos: amount non valido (${amount})`);
    }
    const stan = this._nextStan();
    const ref = (orderRef || idempotencyKey || stan).toString().slice(0, 12).padEnd(12, ' ');
    const fields = {
      3: '000000', // Purchase
      4: String(minor).padStart(12, '0'),
      7: this._transmissionDt(),
      11: stan,
      37: ref,
      41: this.terminalId,
      49: this.currency,
    };
    const reqBuf = encodeIso8583('0200', fields);
    const respBuf = await this._sendFramed(reqBuf);
    const resp = decodeIso8583(respBuf);
    if (resp.mti !== '0210') {
      throw new AppError(CODES.DRIVER_ERROR, `jpos: MTI risposta inatteso ${resp.mti}`);
    }
    const rc = resp.fields[39] || '99';
    const success = rc === '00';
    const outcome = {
      success,
      transactionId: (resp.fields[37] || ref).trim() || `JPOS-${stan}`,
      amount: minor / 100,
      currency,
      orderRef: orderRef || null,
      timestamp: new Date().toISOString(),
      driver: this.name,
      code: rc,
      message: success ? 'OK' : `Response code ${rc}`,
    };
    if (!success) {
      throw new AppError(
        rc === '01' || rc === '04' ? CODES.PAYMENT_DECLINED : CODES.DRIVER_ERROR,
        `jpos: pagamento rifiutato (${rc})`,
        { details: outcome },
      );
    }
    if (idempotencyKey) this._cacheIdempotency(idempotencyKey, outcome);
    return outcome;
  }

  async refund({ transactionId, amount }) {
    if (!this.initialized) await this.init();
    const minor = Math.round(Number(amount) * 100);
    const stan = this._nextStan();
    const ref = String(transactionId || stan).slice(0, 12).padEnd(12, ' ');
    const fields = {
      3: '200000', // Refund
      4: String(minor).padStart(12, '0'),
      7: this._transmissionDt(),
      11: stan,
      37: ref,
      41: this.terminalId,
      49: this.currency,
    };
    const respBuf = await this._sendFramed(encodeIso8583('0220', fields));
    const resp = decodeIso8583(respBuf);
    const rc = resp.fields[39] || '99';
    if (resp.mti !== '0230' || rc !== '00') {
      throw new AppError(CODES.DRIVER_ERROR, `jpos refund: rc=${rc}`, { details: resp });
    }
    return {
      success: true,
      refundId: (resp.fields[37] || ref).trim() || `JPOS-R-${stan}`,
      transactionId,
      amount,
      timestamp: new Date().toISOString(),
      driver: this.name,
    };
  }

  async getStatus() {
    try {
      await this._netManagement();
      return { online: true, name: this.name, host: this.host, port: this.port, terminalId: this.terminalId };
    } catch (err) {
      return { online: false, name: this.name, host: this.host, port: this.port, error: err.message };
    }
  }

  async _netManagement() {
    const stan = this._nextStan();
    const fields = {
      3: '990000',
      7: this._transmissionDt(),
      11: stan,
      41: this.terminalId,
    };
    const respBuf = await this._sendFramed(encodeIso8583('0800', fields), { timeoutMs: 5_000 });
    const resp = decodeIso8583(respBuf);
    if (resp.mti !== '0810') {
      throw new AppError(CODES.DRIVER_ERROR, `jpos NM: MTI ${resp.mti}`);
    }
    return resp;
  }

  _transmissionDt() {
    const d = new Date();
    const pad = (n, w) => String(n).padStart(w, '0');
    return (
      pad(d.getMonth() + 1, 2) +
      pad(d.getDate(), 2) +
      pad(d.getHours(), 2) +
      pad(d.getMinutes(), 2) +
      pad(d.getSeconds(), 2)
    );
  }

  _cacheIdempotency(key, outcome) {
    this._idempotencyCache.set(key, outcome);
    if (this._idempotencyCache.size > 200) {
      this._idempotencyCache.delete(this._idempotencyCache.keys().next().value);
    }
  }

  _sendFramed(payload, { timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      const tmo = timeoutMs ?? this.timeoutMs;
      if (payload.length > 65535) {
        return reject(new AppError(CODES.INVALID_PAYLOAD, 'jpos: payload >65535 byte'));
      }
      const lenBuf = Buffer.alloc(2);
      lenBuf.writeUInt16BE(payload.length, 0);
      const frame = Buffer.concat([lenBuf, payload]);

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
        () => finish(new AppError(CODES.DRIVER_TIMEOUT, `jpos timeout ${tmo}ms`)),
        tmo,
      );

      sock.on('connect', () => sock.write(frame));
      sock.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        if (buf.length >= 2) {
          const expected = buf.readUInt16BE(0);
          if (buf.length >= 2 + expected) {
            finish(null, buf.subarray(2, 2 + expected));
          }
        }
      });
      sock.on('error', (err) => finish(new AppError(CODES.DRIVER_UNAVAILABLE, `jpos socket: ${err.message}`, { cause: err })));
      sock.on('end', () => {
        if (!resolved) finish(new AppError(CODES.DRIVER_ERROR, 'jpos: connessione chiusa anticipatamente'));
      });
    });
  }

  async dispose() {
    this._idempotencyCache.clear();
  }
}

// ─── ISO-8583 codec (subset ASCII-text MTI/bitmap, fixed-format fields) ────

const FIELD_FORMATS = {
  3: { len: 6, type: 'fixed' },
  4: { len: 12, type: 'fixed' },
  7: { len: 10, type: 'fixed' },
  11: { len: 6, type: 'fixed' },
  12: { len: 6, type: 'fixed' },
  13: { len: 4, type: 'fixed' },
  37: { len: 12, type: 'fixed' },
  39: { len: 2, type: 'fixed' },
  41: { len: 8, type: 'fixed' },
  49: { len: 3, type: 'fixed' },
};

function encodeIso8583(mti, fields) {
  if (!/^\d{4}$/.test(mti)) throw new AppError(CODES.INVALID_PAYLOAD, `MTI invalido: ${mti}`);
  const present = Object.keys(fields)
    .map(Number)
    .filter((n) => n >= 1 && n <= 64)
    .sort((a, b) => a - b);
  // Bitmap a 64 bit (8 byte → 16 hex char)
  const bits = new Uint8Array(8);
  for (const n of present) {
    const byte = Math.floor((n - 1) / 8);
    const bit = 7 - ((n - 1) % 8);
    bits[byte] |= 1 << bit;
  }
  const bitmapHex = Buffer.from(bits).toString('hex').toUpperCase();
  let payload = mti + bitmapHex;
  for (const n of present) {
    const fmt = FIELD_FORMATS[n];
    const v = String(fields[n]);
    if (!fmt) throw new AppError(CODES.INVALID_PAYLOAD, `ISO-8583: campo F${n} non supportato`);
    if (v.length !== fmt.len) {
      throw new AppError(
        CODES.INVALID_PAYLOAD,
        `ISO-8583 F${n}: lunghezza errata (${v.length}, attesa ${fmt.len})`,
      );
    }
    payload += v;
  }
  return Buffer.from(payload, 'ascii');
}

function decodeIso8583(buf) {
  const text = buf.toString('ascii');
  if (text.length < 4 + 16) {
    throw new AppError(CODES.DRIVER_ERROR, 'ISO-8583: payload troppo corto');
  }
  const mti = text.slice(0, 4);
  const bitmapHex = text.slice(4, 20);
  const bits = Buffer.from(bitmapHex, 'hex');
  let cursor = 20;
  const fields = {};
  for (let n = 1; n <= 64; n++) {
    const byte = Math.floor((n - 1) / 8);
    const bit = 7 - ((n - 1) % 8);
    if (!(bits[byte] & (1 << bit))) continue;
    if (n === 1) continue; // F1 = secondary bitmap, non gestito qui
    const fmt = FIELD_FORMATS[n];
    if (!fmt) {
      throw new AppError(
        CODES.DRIVER_ERROR,
        `ISO-8583: F${n} presente ma non implementato in decoder`,
      );
    }
    fields[n] = text.slice(cursor, cursor + fmt.len);
    cursor += fmt.len;
  }
  return { mti, fields, bitmapHex };
}

module.exports = { JposDriver, encodeIso8583, decodeIso8583 };
