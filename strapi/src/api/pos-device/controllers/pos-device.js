'use strict';

/**
 * pos-device controller — gestisce pairing e runtime (jobs, ack, heartbeat).
 *
 * IMPORTANTE (vincolo architetturale): Strapi ↔ pos-rt-service comunicano
 * ESCLUSIVAMENTE via HTTP/WebSocket. Questo controller:
 *   - espone endpoint HTTP consumati dal servizio locale
 *   - non condivide codice con pos-rt-service/
 *   - l'unico shared contract è il formato JSON dei payload
 */

const crypto = require('crypto');
const { ulid } = require('ulid');
const orderFinalizer = require('../../../services/order-close-finalizer');
const { computeTotal } = require('../../../utils/order-total');

const API = 'api::pos-device.pos-device';
const JOB_API = 'api::pos-job.pos-job';
const ORDER_API = 'api::order.order';

/**
 * Finalizza la chiusura di un ordine basandosi sull'ack ricevuto dal device.
 * Invoca il service condiviso `order-close-finalizer.finalize`.
 */
async function finalizeOrderFromAck({
  eventId,
  result,
  outcome,
  orderDocumentId,
  userId,
  paymentMethod,
}) {
  try {
    if (result !== 'success') {
      await orderFinalizer.markFiscalFailed({
        strapi,
        orderDocumentId,
        errorCode: outcome.error_code || 'UNKNOWN',
        errorMessage: outcome.error_message || null,
      });
      return;
    }

    const results = await strapi.documents(ORDER_API).findMany({
      filters: {
        documentId: { $eq: orderDocumentId },
        fk_user: { id: { $eq: userId } },
      },
      populate: {
        fk_items: { populate: ['fk_element'] },
        fk_table: true,
        fk_user: true,
        fk_reservation: true,
      },
      limit: 1,
    });
    if (!results || results.length === 0) {
      strapi.log.warn(`ack: ordine ${orderDocumentId} non trovato per user ${userId}`);
      return;
    }
    const order = results[0];
    if (order.status === 'closed') {
      strapi.log.info(`ack: ordine ${orderDocumentId} già chiuso, idempotenza`);
      return;
    }

    const items = order.fk_items || [];
    const totalResult = computeTotal({ items });

    await orderFinalizer.finalize({
      strapi,
      order,
      items,
      totalResult,
      paymentResult: {
        transactionId: outcome.transactionId || eventId,
        timestamp: new Date().toISOString(),
      },
      paymentMethod,
      userId,
      fiscal: {
        status: 'completed',
        receipt_id: outcome.receipt_no || outcome.transactionId || null,
        event_id: eventId,
      },
    });
  } catch (err) {
    strapi.log.error(
      `finalizeOrderFromAck: errore chiusura ordine ${orderDocumentId}: ${err.message}`,
    );
  }
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function sha256Hex(input) {
  return crypto
    .createHash('sha256')
    .update(typeof input === 'string' ? input : JSON.stringify(input))
    .digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function appError(code, message, details) {
  const err = new Error(message);
  err._resCode = code;
  err.details = details || null;
  return err;
}

function sendError(ctx, err) {
  const code = err._resCode || 'INTERNAL';
  const statusMap = {
    INVALID_PAYLOAD: 400,
    NOT_OWNER: 403,
    NOT_FOUND: 404,
    ALREADY_EXISTS: 409,
    DEVICE_REVOKED: 401,
    RATE_LIMITED: 429,
  };
  ctx.status = statusMap[code] || 500;
  ctx.body = { error: { code, message: err.message, details: err.details || null } };
}

function deriveWsUrl(req) {
  const base = process.env.PUBLIC_URL || `http://${req.host || 'localhost:1337'}`;
  return base.replace(/^http/i, 'ws').replace(/\/+$/, '') + '/ws/pos';
}

function publicHttpUrl(req) {
  return (process.env.PUBLIC_URL || `http://${req.host || 'localhost:1337'}`).replace(/\/+$/, '');
}

// ──────────────────────────────────────────────────────────────
// Pairing endpoints (auth: JWT utente)
// ──────────────────────────────────────────────────────────────

module.exports = {
  /**
   * POST /api/pos-devices/register
   * Body: { name, fingerprint, notes? }
   * Auth: JWT utente. Crea device, genera device_token (32 byte), hash salvato.
   * Il token in chiaro è ritornato UNA SOLA VOLTA.
   */
  async register(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const body = ctx.request.body || {};
      const name = (body.name || '').trim();
      const fingerprint = (body.fingerprint || '').trim();
      const notes = (body.notes || '').trim().slice(0, 500);

      if (!name) throw appError('INVALID_PAYLOAD', 'name obbligatorio');
      if (name.length > 120) throw appError('INVALID_PAYLOAD', 'name troppo lungo');
      if (!fingerprint) throw appError('INVALID_PAYLOAD', 'fingerprint obbligatorio');
      if (fingerprint.length > 128) throw appError('INVALID_PAYLOAD', 'fingerprint troppo lungo');

      // Idempotenza soft: se c'è già un device con stesso fingerprint+user non revocato,
      // revochiamo il vecchio e creiamo uno nuovo (re-pairing dopo reinstall).
      const existing = await strapi.db.query(API).findMany({
        where: {
          fk_user: user.id,
          fingerprint,
          revoked_at: null,
        },
        limit: 1,
      });
      if (existing.length > 0) {
        await strapi.db.query(API).update({
          where: { id: existing[0].id },
          data: { revoked_at: new Date() },
        });
      }

      const deviceToken = randomToken(32);
      const tokenHash = sha256Hex(deviceToken);

      const device = await strapi.documents(API).create({
        data: {
          name,
          device_token_hash: tokenHash,
          fingerprint,
          notes: notes || undefined,
          fk_user: { connect: [{ id: user.id }] },
        },
      });

      strapi.log.info(
        `pos-device: device registrato id=${device.id} user=${user.id} name=${name}`,
      );

      ctx.status = 201;
      ctx.body = {
        data: {
          documentId: device.documentId,
          name: device.name,
          device_token: deviceToken,
          strapi_url: publicHttpUrl(ctx),
          ws_url: deriveWsUrl(ctx),
        },
      };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * POST /api/pos-devices/:documentId/revoke
   * Revoca un device (setta revoked_at). Il servizio locale perderà l'accesso.
   */
  async revoke(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const { documentId } = ctx.params;
      if (!documentId) throw appError('INVALID_PAYLOAD', 'documentId mancante');

      const device = await strapi.documents(API).findOne({
        documentId,
        populate: ['fk_user'],
      });
      if (!device) throw appError('NOT_FOUND', 'Device non trovato');
      if (!device.fk_user || device.fk_user.id !== user.id) {
        throw appError('NOT_OWNER', 'Non sei il proprietario di questo device');
      }
      if (device.revoked_at) {
        ctx.status = 200;
        ctx.body = { data: { documentId, revoked_at: device.revoked_at } };
        return;
      }

      const updated = await strapi.documents(API).update({
        documentId,
        data: { revoked_at: new Date() },
      });

      // Chiude WS eventualmente aperto per questo device
      const wsHub = strapi.__posWsHub;
      if (wsHub) wsHub.disconnectDevice(device.id, 4002, 'revoked');

      ctx.status = 204;
      ctx.body = null;
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * GET /api/pos-devices
   * Lista device dell'utente (per gestione admin).
   */
  async listMine(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const rows = await strapi.db.query(API).findMany({
      where: { fk_user: user.id },
      orderBy: { createdAt: 'desc' },
    });
    ctx.body = {
      data: rows.map((r) => ({
        documentId: r.documentId,
        name: r.name,
        fingerprint: r.fingerprint,
        last_seen: r.last_seen,
        revoked_at: r.revoked_at,
        version: r.version,
        created_at: r.createdAt,
      })),
    };
  },

  // ──────────────────────────────────────────────────────────────
  // Runtime endpoints (auth: X-Device-Token, vedi middleware)
  // ──────────────────────────────────────────────────────────────

  /**
   * GET /api/pos-devices/me/jobs?since=<cursor>&limit=50
   * Ritorna i job pending per il device autenticato.
   * cursor: ulid (event_id); ritorna job con event_id > cursor.
   */
  async myJobs(ctx) {
    const device = ctx.state.device;
    if (!device) return ctx.unauthorized();

    try {
      const limit = Math.min(parseInt(ctx.query.limit, 10) || 50, 200);
      const since = ctx.query.since || null;

      const where = { fk_device: device.id, status: 'pending' };
      if (since) where.event_id = { $gt: String(since) };

      const rows = await strapi.db.query(JOB_API).findMany({
        where,
        orderBy: { event_id: 'asc' },
        limit,
      });

      const data = rows.map((r) => ({
        id: r.documentId,
        event_id: r.event_id,
        kind: r.kind,
        payload: safeParseJson(r.payload),
        priority: r.priority,
        created_at: r.createdAt,
      }));

      const nextCursor = rows.length > 0 ? rows[rows.length - 1].event_id : since;

      // Update last_seen del device
      await strapi.db.query(API).update({
        where: { id: device.id },
        data: { last_seen: new Date() },
      });

      ctx.body = { data, meta: { next_cursor: nextCursor, count: rows.length } };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * POST /api/pos-devices/me/jobs/:event_id/ack
   * Body: { result: 'success'|'failure', outcome: {...} }
   * Processa l'ack e aggiorna eventualmente l'ordine collegato.
   */
  async ackJob(ctx) {
    const device = ctx.state.device;
    if (!device) return ctx.unauthorized();

    try {
      const { event_id } = ctx.params;
      if (!event_id) throw appError('INVALID_PAYLOAD', 'event_id mancante');

      const body = ctx.request.body || {};
      const result = body.result;
      const outcome = body.outcome || {};

      if (!['success', 'failure'].includes(result)) {
        throw appError('INVALID_PAYLOAD', 'result deve essere success|failure');
      }

      const row = await strapi.db.query(JOB_API).findOne({
        where: { event_id, fk_device: device.id },
        populate: ['fk_order'],
      });
      if (!row) {
        // Job inesistente: idempotenza → 200 no-op
        ctx.body = { data: { ok: true, already_acked: true } };
        return;
      }

      if (row.status && row.status.startsWith('acked_')) {
        // Già ackato: idempotenza
        ctx.body = { data: { ok: true, already_acked: true, status: row.status } };
        return;
      }

      const newStatus = result === 'success' ? 'acked_success' : 'acked_failure';

      // Aggiorna il job
      await strapi.db.query(JOB_API).update({
        where: { id: row.id },
        data: {
          status: newStatus,
          outcome: JSON.stringify(outcome || {}),
          acked_at: new Date(),
          error_code: result === 'failure' ? (outcome.error_code || 'UNKNOWN') : null,
          error_message: result === 'failure' ? (outcome.error_message || null) : null,
        },
      });

      // Se il job è order.close: finalizza la chiusura via service condiviso
      if (row.kind === 'order.close' && row.fk_order) {
        await finalizeOrderFromAck({
          eventId: event_id,
          result,
          outcome,
          orderDocumentId: row.fk_order.documentId,
          userId: device.fk_user.id,
          paymentMethod: row.payload?.payment_method || 'pos',
        });
      }

      await strapi.db.query(API).update({
        where: { id: device.id },
        data: { last_seen: new Date() },
      });

      ctx.body = { data: { ok: true, order_updated: row.kind === 'order.close' } };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * POST /api/pos-devices/me/heartbeat
   * Body: { version?, uptime?, queue?, drivers?, ... }
   */
  async heartbeat(ctx) {
    const device = ctx.state.device;
    if (!device) return ctx.unauthorized();
    try {
      const body = ctx.request.body || {};
      await strapi.db.query(API).update({
        where: { id: device.id },
        data: {
          last_seen: new Date(),
          version: body.version ? String(body.version).slice(0, 40) : device.version,
        },
      });
      ctx.status = 204;
      ctx.body = null;
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * PATCH /api/pos-devices/me/push-token
   * Body: { apns_token, platform }
   *
   * Aggiorna il push-token APNs (solo iOS) e/o la piattaforma del device.
   * Usato dall'app iOS dopo registrazione APNs per abilitare il silent
   * push wake-up (vedi services/apns/).
   *
   * Token cancellabile: passare apns_token: null per rimuoverlo (es. logout).
   * Platform allowed: ios | android | windows | macos | linux | other.
   */
  async updatePushToken(ctx) {
    const device = ctx.state.device;
    if (!device) return ctx.unauthorized();
    try {
      const body = ctx.request.body || {};
      const allowedPlatforms = ['windows', 'macos', 'linux', 'ios', 'android', 'other'];
      const data = {};

      if ('apns_token' in body) {
        const t = body.apns_token;
        if (t === null || t === '') {
          data.apns_token = null;
          data.apns_token_updated_at = null;
        } else {
          if (typeof t !== 'string' || t.length < 32 || t.length > 200) {
            throw appError('INVALID_PAYLOAD', 'apns_token formato invalido (32..200 char)');
          }
          if (!/^[a-fA-F0-9]+$/.test(t)) {
            throw appError('INVALID_PAYLOAD', 'apns_token deve essere esadecimale');
          }
          data.apns_token = t.toLowerCase();
          data.apns_token_updated_at = new Date();
        }
      }

      if ('platform' in body) {
        const p = String(body.platform || '').toLowerCase();
        if (!allowedPlatforms.includes(p)) {
          throw appError('INVALID_PAYLOAD', `platform deve essere uno di: ${allowedPlatforms.join(', ')}`);
        }
        data.platform = p;
      }

      if (Object.keys(data).length === 0) {
        throw appError('INVALID_PAYLOAD', 'Nessun campo da aggiornare (apns_token o platform)');
      }

      data.last_seen = new Date();
      await strapi.db.query(API).update({ where: { id: device.id }, data });

      ctx.body = {
        data: {
          ok: true,
          apns_token_set: data.apns_token != null,
          apns_token_cleared: 'apns_token' in data && data.apns_token === null,
          platform: data.platform || device.platform || null,
        },
      };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * GET /api/pos-devices/me/config
   * Override config server-side (feature flag, polling interval, ecc).
   * v1: ritorniamo config di base.
   */
  async myConfig(ctx) {
    const device = ctx.state.device;
    if (!device) return ctx.unauthorized();
    ctx.body = {
      data: {
        polling_interval_connected_s: parseInt(process.env.POS_POLL_INTERVAL_CONNECTED_S, 10) || 60,
        polling_interval_disconnected_s:
          parseInt(process.env.POS_POLL_INTERVAL_DISCONNECTED_S, 10) || 10,
        heartbeat_interval_s: parseInt(process.env.POS_HEARTBEAT_INTERVAL_S, 10) || 30,
        features: {
          fiscal_receipt_enabled: false,
        },
      },
    };
  },

  // ──────────────────────────────────────────────────────────────
  // Pairing-token flow (Fase 5)
  // ──────────────────────────────────────────────────────────────

  /**
   * POST /api/pos-devices/me/pairing-token
   * Auth: JWT utente.
   * Body opzionale: { ttl_minutes? } (default 30, range 5..1440)
   * Risposta: { token, expires_at } — il token in chiaro è ritornato UNA VOLTA.
   *
   * Il token (32 byte hex) viene salvato hashato (sha256) per evitare
   * compromissione DB che esporrebbe codici validi. Single-use:
   * `register-by-token` setta `consumed_at` al consumo.
   */
  async createPairingToken(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');
    try {
      const body = ctx.request.body || {};
      let ttl = parseInt(body.ttl_minutes, 10);
      if (!Number.isFinite(ttl) || ttl < 5) ttl = 30;
      if (ttl > 1440) ttl = 1440;

      const token = randomToken(32);
      const tokenHash = sha256Hex(token);
      const expiresAt = new Date(Date.now() + ttl * 60_000);

      await strapi.documents('api::pos-pairing-token.pos-pairing-token').create({
        data: {
          token_hash: tokenHash,
          expires_at: expiresAt,
          created_ip: (ctx.request.ip || '').slice(0, 64),
          fk_user: { connect: [{ id: user.id }] },
        },
      });

      // Cleanup opportunistico: rimuovo i token scaduti dell'utente.
      try {
        await strapi.db.query('api::pos-pairing-token.pos-pairing-token').deleteMany({
          where: {
            fk_user: user.id,
            expires_at: { $lt: new Date() },
          },
        });
      } catch (_) { /* swallow */ }

      ctx.status = 201;
      ctx.body = {
        data: {
          token,
          expires_at: expiresAt.toISOString(),
          ttl_minutes: ttl,
        },
      };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * POST /api/pos-devices/register-by-token
   * No-auth pubblico. Body: { token, name, fingerprint, platform?, notes? }
   * Consuma il pairing-token (one-shot), crea un device collegato all'utente
   * proprietario del token, ritorna device_token in chiaro.
   *
   * Errori: INVALID_TOKEN (404), TOKEN_EXPIRED (410), TOKEN_ALREADY_USED (409),
   * INVALID_PAYLOAD (400).
   */
  async registerByToken(ctx) {
    try {
      const body = ctx.request.body || {};
      const token = String(body.token || '').trim();
      const name = String(body.name || '').trim();
      const fingerprint = String(body.fingerprint || '').trim();
      const platform = String(body.platform || 'other').toLowerCase();
      const notes = String(body.notes || '').trim().slice(0, 500);

      if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
        throw appError('INVALID_PAYLOAD', 'token formato invalido (64 hex)');
      }
      if (!name) throw appError('INVALID_PAYLOAD', 'name obbligatorio');
      if (name.length > 120) throw appError('INVALID_PAYLOAD', 'name troppo lungo');
      if (!fingerprint) throw appError('INVALID_PAYLOAD', 'fingerprint obbligatorio');
      if (fingerprint.length > 128) throw appError('INVALID_PAYLOAD', 'fingerprint troppo lungo');
      const allowedPlatforms = ['windows', 'macos', 'linux', 'ios', 'android', 'other'];
      if (!allowedPlatforms.includes(platform)) {
        throw appError('INVALID_PAYLOAD', `platform invalido (${allowedPlatforms.join(',')})`);
      }

      const tokenHash = sha256Hex(token);
      const records = await strapi.db.query('api::pos-pairing-token.pos-pairing-token').findMany({
        where: { token_hash: tokenHash },
        populate: ['fk_user'],
        limit: 1,
      });
      if (records.length === 0) {
        throw appError('NOT_FOUND', 'Token non valido');
      }
      const tokenRow = records[0];
      if (!tokenRow.fk_user) {
        throw appError('INVALID_PAYLOAD', 'Token orfano (utente cancellato)');
      }
      if (tokenRow.consumed_at) {
        const err = appError('ALREADY_EXISTS', 'Token già utilizzato');
        err._resCode = 'ALREADY_EXISTS';
        throw err;
      }
      if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
        throw appError('INVALID_PAYLOAD', 'Token scaduto');
      }

      const userId = tokenRow.fk_user.id;

      // Reuse logica di register: revoca eventuale device pre-esistente con
      // stesso fingerprint per re-pairing dopo reinstall.
      const existing = await strapi.db.query(API).findMany({
        where: { fk_user: userId, fingerprint, revoked_at: null },
        limit: 1,
      });
      if (existing.length > 0) {
        await strapi.db.query(API).update({
          where: { id: existing[0].id },
          data: { revoked_at: new Date() },
        });
      }

      const deviceToken = randomToken(32);
      const tokenHashDevice = sha256Hex(deviceToken);

      const device = await strapi.documents(API).create({
        data: {
          name,
          device_token_hash: tokenHashDevice,
          fingerprint,
          notes: notes || undefined,
          platform,
          fk_user: { connect: [{ id: userId }] },
        },
      });

      // Marca token consumato (single-use)
      await strapi.db.query('api::pos-pairing-token.pos-pairing-token').update({
        where: { id: tokenRow.id },
        data: { consumed_at: new Date() },
      });

      strapi.log.info(
        `pos-device: register-by-token id=${device.id} user=${userId} platform=${platform}`,
      );

      ctx.status = 201;
      ctx.body = {
        data: {
          documentId: device.documentId,
          name: device.name,
          device_token: deviceToken,
          strapi_url: publicHttpUrl(ctx),
          ws_url: deriveWsUrl(ctx),
        },
      };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * GET /api/pos-devices/installers
   * Pubblico (no auth richiesta — sono URL di download).
   * Risposta: { windows_msi_url, linux_appimage_url, macos_dmg_url,
   *             android_play_url, android_apk_url, ios_appstore_url, current_version }
   *
   * Le URL sono lette da env vars POS_INSTALLER_*. Se non valorizzate,
   * ritornano null (il frontend mostrerà "presto disponibile").
   */
  async installers(ctx) {
    const base = (process.env.PUBLIC_URL || `http://${ctx.host || 'localhost:1337'}`).replace(/\/+$/, '');
    function urlOrNull(envName, defaultLocal) {
      const v = process.env[envName];
      if (v) return v;
      // Default locale: Strapi serve /static/downloads/... Esempio:
      //   POS_INSTALLER_WINDOWS_MSI=https://cdn.example.com/pos-rt-service-1.0.0.msi
      // Se non settata, controlla se esiste localmente; se no, null.
      return defaultLocal ? `${base}${defaultLocal}` : null;
    }
    ctx.body = {
      data: {
        current_version: process.env.POS_RT_SERVICE_VERSION || '1.0.0',
        windows_msi_url: urlOrNull('POS_INSTALLER_WINDOWS_MSI', '/static/downloads/pos-rt-service-latest.msi'),
        linux_appimage_url: urlOrNull('POS_INSTALLER_LINUX_APPIMAGE', null),
        macos_dmg_url: urlOrNull('POS_INSTALLER_MACOS_DMG', null),
        android_play_url: process.env.POS_ANDROID_PLAY_URL || null,
        android_apk_url: urlOrNull('POS_ANDROID_APK', '/static/downloads/pos-rt-mobile-latest.apk'),
        ios_appstore_url: process.env.POS_IOS_APPSTORE_URL || null,
        docs_url: process.env.POS_DOCS_URL || null,
      },
    };
  },
};

function safeParseJson(s) {
  if (s === null || s === undefined) return {};
  if (typeof s === 'object') return s;
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
