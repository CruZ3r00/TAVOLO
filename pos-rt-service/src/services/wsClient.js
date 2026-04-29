'use strict';

const { EventEmitter } = require('events');
const WebSocket = require('ws');
const { getLogger } = require('../utils/logger');
const { wsReconnectDelayMs } = require('../utils/backoff');

const log = getLogger('services/wsClient');

const STATE = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  BACKOFF: 'backoff',
  STOPPED: 'stopped',
};

/**
 * WebSocket client outbound verso Strapi.
 *
 * Eventi emessi:
 *   - 'connected'
 *   - 'disconnected' ({ code, reason })
 *   - 'message' (parsedJson)
 *   - 'error' (err)
 *   - 'state' (newState)
 */
class WsClient extends EventEmitter {
  constructor({ url, deviceToken, pingIntervalMs = 20_000, pongTimeoutMs = 40_000 }) {
    super();
    this.url = url;
    this.deviceToken = deviceToken;
    this.pingIntervalMs = pingIntervalMs;
    this.pongTimeoutMs = pongTimeoutMs;

    this.state = STATE.DISCONNECTED;
    this.ws = null;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.pongTimer = null;
    this.attempt = 0;
    this.stopped = false;
    this.lastPongAt = null;
  }

  setState(s) {
    this.state = s;
    this.emit('state', s);
  }

  setDeviceToken(token) {
    this.deviceToken = token;
  }

  start() {
    this.stopped = false;
    this._connect();
  }

  stop() {
    this.stopped = true;
    this._clearTimers();
    if (this.ws) {
      try {
        this.ws.close(1000, 'client_stop');
      } catch (_) {}
      this.ws = null;
    }
    this.setState(STATE.STOPPED);
  }

  isConnected() {
    return this.state === STATE.CONNECTED && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  send(obj) {
    if (!this.isConnected()) return false;
    try {
      this.ws.send(JSON.stringify(obj));
      return true;
    } catch (err) {
      log.warn({ err }, 'Errore invio WS');
      return false;
    }
  }

  _connect() {
    if (this.stopped) return;
    if (!this.url) {
      log.warn('ws url non configurato, ritento in 30s');
      this.reconnectTimer = setTimeout(() => this._connect(), 30_000);
      return;
    }
    this.setState(STATE.CONNECTING);
    log.info({ url: this.url, attempt: this.attempt }, 'Connessione WS');

    // Mitigazione H-2: il device token va SOLO in header Authorization, mai in
    // URL query string (logging dei reverse proxy / sniffer locali).
    const headers = {
      'User-Agent': 'pos-rt-service/1.0',
    };
    if (this.deviceToken) {
      headers['Authorization'] = `Bearer ${this.deviceToken}`;
    }

    let ws;
    try {
      ws = new WebSocket(this.url, { headers, handshakeTimeout: 15_000 });
    } catch (err) {
      log.error({ err }, 'WebSocket new fallita');
      this._scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.on('open', () => {
      log.info('WS connesso');
      this.attempt = 0;
      this.lastPongAt = Date.now();
      this.setState(STATE.CONNECTED);
      this.emit('connected');
      this._startHeartbeat();
    });

    ws.on('message', (data) => {
      let parsed;
      try {
        parsed = JSON.parse(data.toString('utf8'));
      } catch (err) {
        log.warn({ err }, 'WS message non-JSON, ignorato');
        return;
      }
      if (parsed.type === 'pong' || parsed.type === 'ping') {
        this.lastPongAt = Date.now();
        if (parsed.type === 'ping') {
          this.send({ type: 'pong' });
        }
        return;
      }
      this.emit('message', parsed);
    });

    ws.on('pong', () => {
      this.lastPongAt = Date.now();
    });

    ws.on('close', (code, reason) => {
      log.warn({ code, reason: reason?.toString() }, 'WS chiuso');
      this._clearTimers();
      this.ws = null;
      this.emit('disconnected', { code, reason: reason?.toString() });
      if (!this.stopped) this._scheduleReconnect();
    });

    ws.on('error', (err) => {
      log.warn({ err: err.message }, 'WS errore');
      this.emit('error', err);
    });
  }

  _startHeartbeat() {
    this._clearTimers();
    this.pingTimer = setInterval(() => {
      if (!this.isConnected()) return;
      try {
        this.ws.ping();
        this.send({ type: 'ping', ts: Date.now() });
      } catch (_) {}
      if (this.lastPongAt && Date.now() - this.lastPongAt > this.pongTimeoutMs) {
        log.warn({ since: Date.now() - this.lastPongAt }, 'Pong timeout, forzo reconnect');
        try {
          this.ws.terminate();
        } catch (_) {}
      }
    }, this.pingIntervalMs);
  }

  _clearTimers() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  _scheduleReconnect() {
    if (this.stopped) return;
    const delay = wsReconnectDelayMs(this.attempt);
    this.attempt++;
    this.setState(STATE.BACKOFF);
    log.info({ delay, attempt: this.attempt }, 'WS schedule reconnect');
    this.reconnectTimer = setTimeout(() => this._connect(), delay);
  }

  triggerReconnectNow() {
    if (this.stopped) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._connect();
  }
}

module.exports = { WsClient, STATE };
