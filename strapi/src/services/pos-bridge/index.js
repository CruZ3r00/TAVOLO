'use strict';

/**
 * pos-bridge — orchestratore lato Strapi per il canale pos-rt-service.
 *
 *   - `wsHub`:    registro connessioni WebSocket attive per device
 *   - `dispatchJob`:  crea un pos-job + prova push WS al device
 *
 * Vincolo architetturale: non condivide codice con pos-rt-service/. Il solo
 * contratto è HTTP/JSON + WS/JSON.
 */

const crypto = require('crypto');
const url = require('url');

const JOB_API = 'api::pos-job.pos-job';
const DEVICE_API = 'api::pos-device.pos-device';

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

class WsHub {
  constructor(strapi) {
    this.strapi = strapi;
    // deviceId -> Set<WebSocket>
    this.connections = new Map();
  }

  register(deviceId, ws) {
    if (!this.connections.has(deviceId)) this.connections.set(deviceId, new Set());
    this.connections.get(deviceId).add(ws);
  }

  unregister(deviceId, ws) {
    const set = this.connections.get(deviceId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) this.connections.delete(deviceId);
  }

  isConnected(deviceId) {
    const set = this.connections.get(deviceId);
    if (!set) return false;
    for (const ws of set) if (ws.readyState === 1) return true;
    return false;
  }

  push(deviceId, message) {
    const set = this.connections.get(deviceId);
    if (!set) return 0;
    const payload = JSON.stringify(message);
    let delivered = 0;
    for (const ws of set) {
      if (ws.readyState === 1) {
        try {
          ws.send(payload);
          delivered++;
        } catch (err) {
          this.strapi.log.warn(`ws push fallita: ${err.message}`);
        }
      }
    }
    return delivered;
  }

  disconnectDevice(deviceId, code = 1000, reason = 'server_close') {
    const set = this.connections.get(deviceId);
    if (!set) return;
    for (const ws of Array.from(set)) {
      try {
        ws.close(code, reason);
      } catch (_) {}
    }
    this.connections.delete(deviceId);
  }

  stats() {
    let total = 0;
    for (const set of this.connections.values()) {
      for (const ws of set) if (ws.readyState === 1) total++;
    }
    return { devices: this.connections.size, sockets: total };
  }
}

/**
 * Inizializza server WebSocket su strapi.server.httpServer.
 * Route: /ws/pos  (auth: device_token via header Authorization: Bearer oppure query ?token=)
 */
function setupWebSocketServer(strapi) {
  if (strapi.__posWsHub) return strapi.__posWsHub;

  // Lazy load: ws è già dep transitive di Strapi
  const { WebSocketServer } = require('ws');

  const hub = new WsHub(strapi);
  strapi.__posWsHub = hub;

  const wss = new WebSocketServer({ noServer: true });

  const httpServer = strapi.server.httpServer;
  if (!httpServer) {
    strapi.log.warn('pos-bridge: strapi.server.httpServer non disponibile, WS disabilitato');
    return hub;
  }

  httpServer.on('upgrade', async (req, socket, head) => {
    try {
      const parsed = url.parse(req.url || '', true);
      if (!parsed.pathname || !parsed.pathname.startsWith('/ws/pos')) {
        return; // lascia ad altri handler
      }

      const authHeader = req.headers['authorization'] || req.headers['Authorization'];
      let token = null;
      if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      } else if (parsed.query && parsed.query.token) {
        token = String(parsed.query.token);
      }

      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const hash = sha256Hex(token);
      const devices = await strapi.db.query(DEVICE_API).findMany({
        where: { device_token_hash: hash },
        populate: ['fk_user'],
        limit: 2,
      });
      if (devices.length !== 1) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      const device = devices[0];
      if (device.revoked_at) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, device);
      });
    } catch (err) {
      strapi.log.error(`pos-bridge upgrade error: ${err.message}`);
      try {
        socket.destroy();
      } catch (_) {}
    }
  });

  wss.on('connection', async (ws, req, device) => {
    hub.register(device.id, ws);
    strapi.log.info(`pos-bridge: device ${device.id} (${device.name}) connected via WS`);

    try {
      await strapi.db.query(DEVICE_API).update({
        where: { id: device.id },
        data: { last_seen: new Date() },
      });
    } catch (_) {}

    // Invia job pending immediatamente al connect (catch-up)
    try {
      const pending = await strapi.db.query(JOB_API).findMany({
        where: { fk_device: device.id, status: 'pending' },
        orderBy: { event_id: 'asc' },
        limit: 50,
      });
      for (const row of pending) {
        try {
          ws.send(
            JSON.stringify({
              type: 'job.new',
              id: row.documentId,
              event_id: row.event_id,
              kind: row.kind,
              payload: safeJson(row.payload),
              priority: row.priority,
            }),
          );
        } catch (_) {}
      }
    } catch (err) {
      strapi.log.warn(`pos-bridge: catch-up pending fallito: ${err.message}`);
    }

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString('utf8'));
      } catch {
        return;
      }
      if (msg.type === 'ping') {
        try {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        } catch (_) {}
        return;
      }
      if (msg.type === 'pong') return;
      if (msg.type === 'heartbeat') {
        try {
          await strapi.db.query(DEVICE_API).update({
            where: { id: device.id },
            data: {
              last_seen: new Date(),
              version: msg.stats?.version ? String(msg.stats.version).slice(0, 40) : device.version,
            },
          });
        } catch (_) {}
      }
      // Gli ack arrivano via HTTP /api/pos-devices/me/jobs/:event_id/ack
    });

    ws.on('close', () => {
      hub.unregister(device.id, ws);
      strapi.log.info(`pos-bridge: device ${device.id} WS closed`);
    });

    ws.on('error', (err) => {
      strapi.log.warn(`pos-bridge ws error device=${device.id}: ${err.message}`);
    });
  });

  strapi.log.info('pos-bridge: WebSocket server montato su /ws/pos');
  return hub;
}

function safeJson(v) {
  if (v === null || v === undefined) return {};
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return {};
  }
}

/**
 * Trova il device attivo per un utente. Per design v1: al massimo 1 device non
 * revocato per utente (l'ultimo registrato). Se ci sono più device attivi,
 * scegliamo quello con last_seen più recente.
 */
async function findActiveDeviceForUser(strapi, userId) {
  const rows = await strapi.db.query(DEVICE_API).findMany({
    where: { fk_user: userId, revoked_at: null },
    orderBy: { last_seen: 'desc' },
    limit: 1,
  });
  return rows[0] || null;
}

/**
 * Crea un pos-job e prova push immediato se il device è connesso via WS.
 * Se il device è iOS e non è raggiungibile via WS, invia silent push APNs
 * (fire-and-forget) per svegliare l'app, che farà polling singolo.
 * Ritorna { job, delivered_via_ws, apns_pushed, event_id }.
 */
async function dispatchJob(strapi, { device, user, kind, payload, orderId, priority = 100 }) {
  const { ulid } = require('ulid');
  const eventId = ulid();

  const job = await strapi.documents(JOB_API).create({
    data: {
      event_id: eventId,
      kind,
      payload: payload || {},
      status: 'pending',
      priority,
      fk_device: { connect: [{ id: device.id }] },
      fk_user: { connect: [{ id: user.id }] },
      ...(orderId
        ? { fk_order: { connect: [{ documentId: orderId }] } }
        : {}),
    },
  });

  const hub = strapi.__posWsHub;
  let delivered = 0;
  if (hub && hub.isConnected(device.id)) {
    delivered = hub.push(device.id, {
      type: 'job.new',
      id: job.documentId,
      event_id: eventId,
      kind,
      payload: payload || {},
      priority,
    });
    if (delivered > 0) {
      await strapi.db.query(JOB_API).update({
        where: { id: job.id },
        data: { status: 'dispatched', dispatched_at: new Date() },
      });
    }
  }

  // APNs silent push wake-up: solo iOS, solo se non già consegnato via WS.
  // Fire-and-forget: la creazione del job NON deve mai fallire per errori APNs.
  let apnsPushed = false;
  if (delivered === 0 && device.platform === 'ios' && device.apns_token) {
    try {
      const apns = require('../apns');
      const res = await apns.pushWakeup(strapi, device, { jobHint: 1, event_id: eventId });
      apnsPushed = !!res.sent;
    } catch (err) {
      strapi.log.warn(`pos-bridge: APNs push exception (ignorata): ${err.message}`);
    }
  }

  return { job, delivered_via_ws: delivered > 0, apns_pushed: apnsPushed, event_id: eventId };
}

module.exports = {
  setupWebSocketServer,
  findActiveDeviceForUser,
  dispatchJob,
};
