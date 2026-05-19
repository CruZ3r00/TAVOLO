'use strict';

const net = require('net');
const { PrinterDriver } = require('./base');
const { AppError, CODES } = require('../../utils/errors');
const { getLogger } = require('../../utils/logger');
const { concatBytes } = require('../helpers/frame');

const log = getLogger('drivers/printer/escpos-network');

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/**
 * ESC/POS network printer driver -- Node daemon port.
 *
 * Target: stampanti comande Epson TM e compatibili su LAN/WiFi, raw TCP 9100.
 * Ported from mobile/src/drivers/escposNetwork.ts: sendTcpOnce -> net.Socket.
 */
class EscposNetworkDriver extends PrinterDriver {
  constructor(options = {}) {
    super(options);
    this.name = 'escpos-network';
    this.host = options.host || '';
    this.port = options.port || 9100;
    this.timeoutMs = options.timeoutMs || 10_000;
    this.width = options.width || 42;
    this.stations = options.stations || {};
    this.initialized = false;
  }

  async init() {
    const hasDefault = !!this.host;
    const hasStation = Object.values(this.stations).some((s) => !!s?.host);
    if (!hasDefault && !hasStation) {
      throw new AppError(CODES.DRIVER_UNAVAILABLE, 'escpos-network: configura almeno un IP stampante');
    }
    this.initialized = true;
  }

  async printReceipt(data) {
    if (!this.initialized) await this.init();
    const lines = [];
    if (data.header) lines.push(...this._wrap(String(data.header)));
    for (const item of data.items || []) {
      const qty = Number(item.quantity || 1);
      const name = item.name || item.description || 'Voce';
      lines.push(`${qty}x ${name}`);
    }
    if (data.total != null) {
      lines.push(this._rule());
      lines.push(`TOTALE ${Number(data.total || 0).toFixed(2)} EUR`);
    }
    if (data.footer) lines.push(...this._wrap(String(data.footer)));
    return this._sendTicket({ title: 'RICEVUTA', items: [], action: 'reprint' }, lines);
  }

  async printFiscalReceipt(data) {
    return this.printReceipt(data);
  }

  async printKitchenTicket(data) {
    if (!this.initialized) await this.init();
    const station = _normalizeStation(data.station);
    const action = _normalizeAction(data.action);
    const title = data.title || _titleFor(action, station);
    const lines = [];

    lines.push(new Date(data.printed_at || Date.now()).toLocaleString('it-IT'));
    if (data.table?.number != null) {
      lines.push(`TAVOLO ${data.table.number}${data.table.area ? ` - ${data.table.area}` : ''}`);
    } else if (data.takeaway) {
      lines.push(`ASPORTO${data.takeaway.customer_name ? ` - ${data.takeaway.customer_name}` : ''}`);
      if (data.takeaway.pickup_at) lines.push(`Ritiro: ${_formatTime(data.takeaway.pickup_at)}`);
    }
    lines.push(this._rule());

    const grouped = _groupByCourse(data.items || []);
    for (const [course, items] of grouped) {
      if (course) lines.push(`PORTATA ${course}`);
      for (const item of items) {
        const qty = Number(item.quantity || 1);
        const prefix = action === 'cancel' ? 'ANNULLA ' : action === 'update' ? 'MODIFICA ' : '';
        lines.push(...this._wrap(`${prefix}${qty}x ${item.name || 'Voce'}`));
        if (item.notes) {
          lines.push(...this._wrap(`  note: ${item.notes}`));
        }
      }
    }
    lines.push(this._rule());
    lines.push((station || 'cucina').toUpperCase());

    return this._sendTicket(data, lines, title);
  }

  async getStatus() {
    const firstStation = Object.values(this.stations).find((s) => !!s?.host);
    const target = this.host
      ? this._resolveTarget(null)
      : { host: firstStation?.host || '', port: Number(firstStation?.port || 9100) };
    if (!target.host) {
      return { online: false, name: this.name, error: 'Nessun IP stampante configurato' };
    }
    try {
      await _sendTcpOnce(target.host, target.port, Buffer.from([ESC, 0x40]), {
        timeoutMs: 2_000,
        quietMs: 80,
      });
      return { online: true, name: this.name, host: target.host, port: target.port };
    } catch (err) {
      return { online: false, name: this.name, host: target.host, port: target.port, error: err.message };
    }
  }

  async dispose() {
    /* noop */
  }

  // --- Private ---

  async _sendTicket(data, lines, title = 'COMANDA') {
    const target = this._resolveTarget(data.station);
    if (!target.host) {
      throw new AppError(
        CODES.DRIVER_UNAVAILABLE,
        `escpos-network: IP mancante per ${data.station || 'default'}`,
      );
    }
    const payload = concatBytes([
      _bytes([ESC, 0x40]),             // init
      _bytes([ESC, 0x61, 0x01]),       // center
      _bytes([ESC, 0x45, 0x01]),       // bold on
      _bytes([GS, 0x21, 0x11]),        // double w+h
      _text(`${title}\n`),
      _bytes([GS, 0x21, 0x00]),        // normal size
      _bytes([ESC, 0x45, 0x00]),       // bold off
      _bytes([ESC, 0x61, 0x00]),       // left align
      _text(lines.join('\n')),
      _text('\n\n\n'),
      _bytes([GS, 0x56, 0x00]),        // cut
    ]);
    await _sendTcpOnce(target.host, target.port, payload, {
      timeoutMs: this.timeoutMs,
      quietMs: 120,
    });
    return {
      success: true,
      receipt_no: `KT-${Date.now()}`,
      fiscal: false,
      timestamp: new Date().toISOString(),
      driver: this.name,
    };
  }

  _resolveTarget(station) {
    const key = _normalizeStation(station);
    const stationTarget = key ? this.stations[key] : null;
    return {
      host: stationTarget?.host || this.host,
      port: Number(stationTarget?.port || this.port || 9100),
    };
  }

  _rule() {
    return '-'.repeat(Math.max(24, Math.min(this.width, 48)));
  }

  _wrap(value) {
    const max = Math.max(24, Math.min(this.width, 48));
    const words = _sanitize(value).split(/\s+/).filter(Boolean);
    const out = [];
    let line = '';
    for (const word of words) {
      if (!line) {
        line = word;
      } else if ((line + ' ' + word).length <= max) {
        line += ' ' + word;
      } else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
    return out.length ? out : [''];
  }
}

// --- Pure helpers (module-level, no `this`) ---

/**
 * Send data to TCP host:port, wait for optional response, close.
 * Replaces Capacitor's sendTcpOnce with Node net.Socket.
 */
function _sendTcpOnce(host, port, data, { timeoutMs = 10_000, quietMs = 120 } = {}) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    let buf = Buffer.alloc(0);
    let resolved = false;
    let quietTimer = null;

    const finish = (err, res) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      clearTimeout(quietTimer);
      try { sock.destroy(); } catch (_) {}
      err ? reject(err) : resolve(res);
    };

    const timer = setTimeout(
      () => finish(new AppError(CODES.DRIVER_TIMEOUT, `escpos-network timeout ${timeoutMs}ms`)),
      timeoutMs,
    );

    sock.on('connect', () => sock.write(data));
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => finish(null, buf), quietMs);
    });
    sock.on('error', (err) =>
      finish(new AppError(CODES.DRIVER_UNAVAILABLE, `escpos-network socket: ${err.message}`, { cause: err })),
    );
    sock.on('end', () => {
      if (!resolved) {
        // Stampanti comande spesso non rispondono: nessun dato e' OK.
        clearTimeout(quietTimer);
        finish(null, buf);
      }
    });
  });
}

function _bytes(values) {
  return new Uint8Array(values);
}

function _text(value) {
  return Buffer.from(_sanitize(value), 'latin1');
}

function _sanitize(value) {
  return String(value || '')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xC0-\xFF]/g, '');
}

function _normalizeStation(value) {
  const station = String(value || '').trim().toLowerCase();
  return station || null;
}

function _normalizeAction(value) {
  const action = String(value || 'add').toLowerCase();
  return ['add', 'update', 'cancel', 'reprint'].includes(action) ? action : 'add';
}

function _titleFor(action, station) {
  const suffix = station ? ` ${station.toUpperCase()}` : '';
  if (action === 'cancel') return `ANNULLA${suffix}`;
  if (action === 'update') return `MODIFICA${suffix}`;
  if (action === 'reprint') return `RISTAMPA${suffix}`;
  return `COMANDA${suffix}`;
}

function _groupByCourse(items) {
  const map = new Map();
  for (const item of items) {
    const course = Number.isFinite(Number(item.course)) ? Number(item.course) : null;
    const list = map.get(course) || [];
    list.push(item);
    map.set(course, list);
  }
  return [...map.entries()].sort((a, b) => Number(a[0] || 0) - Number(b[0] || 0));
}

function _formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

module.exports = { EscposNetworkDriver };
