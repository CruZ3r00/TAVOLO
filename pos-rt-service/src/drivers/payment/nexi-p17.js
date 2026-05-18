'use strict';

const net = require('net');
const { PaymentDriver } = require('./base');
const { AppError, CODES } = require('../../utils/errors');
const { getLogger } = require('../../utils/logger');
const {
  ACK,
  NAK,
  ETX,
  wrapStxEtxLrc,
  unwrapStxEtxLrc,
  ackPacket,
  nakPacket,
} = require('../helpers/frame');

const log = getLogger('drivers/payment/nexi-p17');

/**
 * Default pipe-delimited message encoder. Funziona con l'emulatore
 * `mock-nexi-p17-server.js` e con un sottoinsieme dei terminali ECR17 demo.
 * SOSTITUIRE per terminali reali Nexi (la matrice campi e' confidenziale).
 */
const defaultMessageEncoder = {
  payment(ctx) {
    const body =
      `OP=PAY|TID=${_esc(ctx.terminalId)}|WID=${_esc(ctx.workstationId)}|` +
      `AMT=${ctx.amountCents}|CUR=${_esc(ctx.currency)}|REF=${_esc(ctx.txnRef)}`;
    return Buffer.from(body, 'latin1');
  },
  refund(ctx) {
    const body =
      `OP=REF|TID=${_esc(ctx.terminalId)}|WID=${_esc(ctx.workstationId)}|` +
      `AMT=${ctx.amountCents}|CUR=${_esc(ctx.currency)}|REF=${_esc(ctx.txnRef)}|ORIG=${_esc(ctx.originalTxId)}`;
    return Buffer.from(body, 'latin1');
  },
  inquiry(ctx) {
    const body = `OP=INQ|TID=${_esc(ctx.terminalId)}|WID=${_esc(ctx.workstationId)}|REF=${_esc(ctx.txnRef)}`;
    return Buffer.from(body, 'latin1');
  },
  status(ctx) {
    const body = `OP=STAT|TID=${_esc(ctx.terminalId)}|WID=${_esc(ctx.workstationId)}`;
    return Buffer.from(body, 'latin1');
  },
  parseResponse(raw) {
    const text = Buffer.from(raw).toString('latin1');
    const fields = {};
    for (const part of text.split('|')) {
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      fields[part.slice(0, eq).trim().toUpperCase()] = part.slice(eq + 1);
    }
    const rc = fields.RC ?? '99';
    return {
      rc,
      approved: rc === '00' || rc === '0',
      declined: rc === '04' || rc === '05' || rc === '51',
      notFound: rc === '13' || (fields.STATUS || '').toUpperCase() === 'NOT_FOUND',
      transactionId: fields.TXN || fields.TRX || fields.AUTH,
      authCode: fields.AUTH,
      message: fields.MSG,
      raw: text,
      fields,
    };
  },
};

/**
 * Nexi P17 driver -- Protocollo 17 / ECR17 (Italia) per terminali POS Nexi.
 *
 * Wire format (da spec ufficiale Nexi developer portal):
 *   - Pacchetti applicazione: STX(0x02) | message | ETX(0x03) | LRC
 *   - LRC = XOR base 0x7F con tutti i byte tra STX (escluso) e ETX (incluso)
 *   - ACK = 0x06 0x03 0x7A, NAK = 0x15 0x03 0x69
 *   - L'ECR (questa app) e' il client TCP; il terminale e' il server
 *   - Comunicazione iniziata dall'ECR; il terminale risponde con ACK immediato
 *     poi con un secondo pacchetto (response) dopo l'inserimento PIN
 *
 * Ported from mobile/src/drivers/nexiP17.ts.
 * Key change: withSession (Capacitor PosTcpStreamPlugin) -> net.Socket Node
 * con _withSession pattern (connect, exchange, close).
 */
class NexiP17Driver extends PaymentDriver {
  constructor(options = {}) {
    super(options);
    this.name = 'nexi-p17';
    this.host = options.host;
    this.port = options.port || 9999;
    this.terminalId = options.terminalId || 'TID00001';
    this.workstationId = options.workstationId || 'POS01';
    this.currency = options.currency || '978';
    this.connectTimeoutMs = options.connectTimeoutMs || 8_000;
    this.ackTimeoutMs = options.ackTimeoutMs || 5_000;
    this.responseTimeoutMs = options.responseTimeoutMs || 120_000;
    this.maxRetries = options.maxRetries || 3;
    this.lrcBase = options.lrcBase ?? 0x7f;
    this.messageEncoder = options.messageEncoder || defaultMessageEncoder;
    this.initialized = false;
  }

  async init() {
    if (!this.host) throw new AppError(CODES.DRIVER_UNAVAILABLE, 'nexi-p17: host mancante');
    this.initialized = true;
  }

  async charge(input) {
    if (!this.initialized) await this.init();
    const amountCents = Math.round(Number(input.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new AppError(CODES.INVALID_PAYLOAD, `nexi-p17: importo invalido ${input.amount}`);
    }
    const txnRef = (input.idempotencyKey || input.orderRef || `T${Date.now()}`).slice(0, 24);

    return this._withSession(async (session) => {
      const msg = this.messageEncoder.payment({
        amountCents,
        currency: this.currency,
        txnRef,
        terminalId: this.terminalId,
        workstationId: this.workstationId,
      });
      const respPayload = await this._exchange(session, msg);
      const parsed = this.messageEncoder.parseResponse(respPayload);
      if (parsed.approved) {
        return {
          success: true,
          transactionId: parsed.transactionId || txnRef,
          amount: amountCents / 100,
          currency: input.currency || 'EUR',
          orderRef: input.orderRef ?? null,
          timestamp: new Date().toISOString(),
          driver: this.name,
          code: parsed.rc,
          message: parsed.message || 'OK',
        };
      }
      throw new AppError(
        parsed.declined ? CODES.PAYMENT_DECLINED : CODES.DRIVER_ERROR,
        `nexi-p17: ${parsed.message || 'rifiutato'} (rc=${parsed.rc})`,
        { details: parsed },
      );
    });
  }

  async refund(input) {
    if (!this.initialized) await this.init();
    const amountCents = Math.round(input.amount * 100);
    const txnRef = `R${Date.now()}`.slice(0, 24);
    return this._withSession(async (session) => {
      const msg = this.messageEncoder.refund({
        amountCents,
        currency: this.currency,
        txnRef,
        terminalId: this.terminalId,
        workstationId: this.workstationId,
        originalTxId: input.transactionId,
      });
      const respPayload = await this._exchange(session, msg);
      const parsed = this.messageEncoder.parseResponse(respPayload);
      if (!parsed.approved) {
        throw new AppError(
          CODES.DRIVER_ERROR,
          `nexi-p17 refund: ${parsed.message || 'rifiutato'} (rc=${parsed.rc})`,
          { details: parsed },
        );
      }
      return {
        success: true,
        refundId: parsed.transactionId || txnRef,
        transactionId: input.transactionId,
        amount: input.amount,
        timestamp: new Date().toISOString(),
        driver: this.name,
      };
    });
  }

  /**
   * Inquiry op (P17 17.6): chiede al terminale lo stato di una transazione precedente.
   *  - Approved sul terminale -> ritorna ChargeOutcome (recovery: NIENTE re-charge).
   *  - Confermato non-trovata -> ritorna null (safe re-issue).
   *  - Esito incerto / errore comunicazione -> throw. Il jobHandler
   *    deve marcare failed per evitare doppio addebito (verifica manuale).
   */
  async inquiry(txnRef, hint = {}) {
    if (!this.initialized) await this.init();
    return this._withSession(async (session) => {
      const msg = this.messageEncoder.inquiry({
        txnRef,
        terminalId: this.terminalId,
        workstationId: this.workstationId,
      });
      const respPayload = await this._exchange(session, msg, { responseTimeoutMs: 10_000 });
      const parsed = this.messageEncoder.parseResponse(respPayload);
      if (parsed.approved) {
        const amount = (hint.amountCents ?? 0) / 100;
        return {
          success: true,
          transactionId: parsed.transactionId || txnRef,
          amount,
          currency: 'EUR',
          orderRef: hint.orderRef ?? null,
          timestamp: new Date().toISOString(),
          driver: this.name,
          code: parsed.rc,
          message: parsed.message || 'OK (recovered via Inquiry)',
        };
      }
      if (parsed.notFound) return null;
      throw new AppError(
        CODES.DRIVER_ERROR,
        `nexi-p17 inquiry: stato incerto (rc=${parsed.rc}, msg=${parsed.message ?? '-'})`,
        { details: parsed },
      );
    });
  }

  async getStatus() {
    if (!this.host) {
      return { online: false, name: this.name, error: 'host non configurato' };
    }
    try {
      await this._withSession(
        async (session) => {
          const msg = this.messageEncoder.status({
            terminalId: this.terminalId,
            workstationId: this.workstationId,
          });
          await this._exchange(session, msg, { responseTimeoutMs: 5_000 });
        },
        { connectTimeoutMs: 3_000 },
      );
      return { online: true, name: this.name, host: this.host, port: this.port };
    } catch (err) {
      return { online: false, name: this.name, host: this.host, error: err?.message };
    }
  }

  async dispose() {
    /* no persistent resource: ogni charge apre/chiude la session */
  }

  // --- TCP session management (replaces Capacitor's withSession) ---

  /**
   * Open a TCP connection, run `fn(session)`, close.
   * Session exposes: send(data), recv(timeoutMs, minBytes), recvUntil(delimiter, tailBytes, timeoutMs).
   */
  async _withSession(fn, { connectTimeoutMs } = {}) {
    const timeout = connectTimeoutMs || this.connectTimeoutMs;
    const sock = await this._connect(timeout);
    const session = new TcpSession(sock);
    try {
      return await fn(session);
    } finally {
      session.destroy();
    }
  }

  _connect(timeoutMs) {
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ host: this.host, port: this.port });
      const timer = setTimeout(() => {
        sock.destroy();
        reject(new AppError(CODES.DRIVER_TIMEOUT, `nexi-p17: connect timeout ${timeoutMs}ms`));
      }, timeoutMs);
      sock.once('connect', () => {
        clearTimeout(timer);
        resolve(sock);
      });
      sock.once('error', (err) => {
        clearTimeout(timer);
        reject(new AppError(CODES.DRIVER_UNAVAILABLE, `nexi-p17: connect error: ${err.message}`, { cause: err }));
      });
    });
  }

  /**
   * Send + recv ACK + recv response + send ACK. Retry max sui NAK.
   * Ritorna il payload (senza STX/ETX/LRC) della response.
   */
  async _exchange(session, payload, overrides = {}) {
    const wrapped = wrapStxEtxLrc(payload, this.lrcBase);
    let lastError = null;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      await session.send(wrapped);
      const ackByte = await this._readAckOrNak(session);
      if (ackByte === ACK) { lastError = null; break; }
      if (ackByte === NAK) {
        lastError = new AppError(CODES.DRIVER_ERROR, `nexi-p17: NAK ricevuto (tentativo ${attempt})`);
        continue;
      }
      lastError = new AppError(
        CODES.DRIVER_ERROR,
        `nexi-p17: byte di controllo inatteso 0x${ackByte.toString(16)} (tentativo ${attempt})`,
      );
    }
    if (lastError) throw lastError;

    const respFrame = await session.recvUntil(
      ETX,
      1, // 1 byte tail per leggere il LRC
      overrides.responseTimeoutMs ?? this.responseTimeoutMs,
    );
    let unwrapped;
    try {
      unwrapped = unwrapStxEtxLrc(respFrame, this.lrcBase);
    } catch (err) {
      try { await session.send(nakPacket(this.lrcBase)); } catch (_) { /* swallow */ }
      throw new AppError(CODES.DRIVER_ERROR, `nexi-p17: response framing invalida -- ${err.message}`);
    }
    try {
      await session.send(ackPacket(this.lrcBase));
    } catch (_) {
      /* il terminale a volte chiude subito dopo aver inviato la response: non fatale */
    }
    return unwrapped.payload;
  }

  async _readAckOrNak(session) {
    const start = Date.now();
    while (Date.now() - start < this.ackTimeoutMs) {
      const remaining = Math.max(100, this.ackTimeoutMs - (Date.now() - start));
      const chunk = await session.recv(remaining, 1);
      if (chunk.length >= 1) return chunk[0];
    }
    throw new AppError(CODES.DRIVER_TIMEOUT, `nexi-p17: timeout attesa ACK (${this.ackTimeoutMs}ms)`);
  }
}

/**
 * Minimal TCP session wrapper around net.Socket.
 * Provides send/recv/recvUntil interface matching the Capacitor TcpSession API.
 */
class TcpSession {
  constructor(sock) {
    this._sock = sock;
    this._buf = Buffer.alloc(0);
    this._destroyed = false;
    this._waiters = [];

    sock.on('data', (chunk) => {
      this._buf = Buffer.concat([this._buf, chunk]);
      // Wake any pending recv waiter
      for (const w of this._waiters) w.check();
    });
    sock.on('error', (err) => {
      for (const w of this._waiters) w.reject(err);
      this._waiters = [];
    });
    sock.on('close', () => {
      for (const w of this._waiters) w.check(); // let them see what we have
    });
  }

  async send(data) {
    if (this._destroyed) throw new AppError(CODES.DRIVER_ERROR, 'nexi-p17: session closed');
    return new Promise((resolve, reject) => {
      this._sock.write(data, (err) => (err ? reject(err) : resolve()));
    });
  }

  /**
   * Read at least `minBytes` bytes, or whatever is available after `timeoutMs`.
   */
  recv(timeoutMs, minBytes = 1) {
    return new Promise((resolve, reject) => {
      const waiter = {
        check: () => {
          if (this._buf.length >= minBytes) {
            clearTimeout(timer);
            const out = Buffer.from(this._buf);
            this._buf = Buffer.alloc(0);
            removeWaiter();
            resolve(out);
          }
        },
        reject: (err) => {
          clearTimeout(timer);
          removeWaiter();
          reject(err);
        },
      };
      const removeWaiter = () => {
        const idx = this._waiters.indexOf(waiter);
        if (idx >= 0) this._waiters.splice(idx, 1);
      };
      this._waiters.push(waiter);

      const timer = setTimeout(() => {
        removeWaiter();
        // Return whatever we have on timeout
        const out = Buffer.from(this._buf);
        this._buf = Buffer.alloc(0);
        resolve(out);
      }, timeoutMs);

      // Check immediately in case data already present
      waiter.check();
    });
  }

  /**
   * Read until `delimiter` byte is found, then read `tailBytes` more.
   * Returns the complete frame (including delimiter + tail).
   */
  recvUntil(delimiter, tailBytes, timeoutMs) {
    return new Promise((resolve, reject) => {
      const waiter = {
        check: () => {
          const delimIdx = this._buf.indexOf(delimiter);
          if (delimIdx >= 0 && this._buf.length >= delimIdx + 1 + tailBytes) {
            clearTimeout(timer);
            const frameEnd = delimIdx + 1 + tailBytes;
            const frame = Buffer.from(this._buf.subarray(0, frameEnd));
            this._buf = Buffer.from(this._buf.subarray(frameEnd));
            removeWaiter();
            resolve(frame);
          }
        },
        reject: (err) => {
          clearTimeout(timer);
          removeWaiter();
          reject(new AppError(CODES.DRIVER_ERROR, `nexi-p17: session error: ${err.message}`));
        },
      };
      const removeWaiter = () => {
        const idx = this._waiters.indexOf(waiter);
        if (idx >= 0) this._waiters.splice(idx, 1);
      };
      this._waiters.push(waiter);

      const timer = setTimeout(() => {
        removeWaiter();
        reject(new AppError(CODES.DRIVER_TIMEOUT, `nexi-p17: timeout attesa response (${timeoutMs}ms)`));
      }, timeoutMs);

      waiter.check();
    });
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    try { this._sock.destroy(); } catch (_) {}
  }
}

function _esc(s) {
  return String(s).replace(/[|\r\n\x00-\x1f]/g, '_');
}

module.exports = { NexiP17Driver, defaultMessageEncoder };
