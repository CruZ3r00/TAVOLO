'use strict';

/**
 * Middleware device-token — autentica le richieste /api/pos-devices/me/*
 * verificando l'header `X-Device-Token` (o `Authorization: Bearer <token>`)
 * contro il `device_token_hash` del content-type `api::pos-device.pos-device`.
 *
 * Se valido, setta `ctx.state.device` con il record (senza hash).
 * Rifiuta con 401 se il token è mancante/invalido o il device è revocato.
 *
 * NOTA: questo middleware vive in strapi/, non condivide codice con
 * pos-rt-service/. Il contratto token è stabilito tramite il flusso
 * /api/pos-devices/register.
 */

const crypto = require('crypto');

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function extractToken(ctx) {
  const h = ctx.request.headers || {};
  const explicit = h['x-device-token'] || h['X-Device-Token'];
  if (explicit && typeof explicit === 'string') return explicit.trim();
  const auth = h['authorization'] || h['Authorization'];
  if (auth && typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

module.exports = (_config, { strapi }) => {
  return async (ctx, next) => {
    const token = extractToken(ctx);
    if (!token) {
      ctx.status = 401;
      ctx.body = { error: { code: 'DEVICE_TOKEN_MISSING', message: 'X-Device-Token mancante' } };
      return;
    }

    const hash = sha256Hex(token);
    const devices = await strapi.db.query('api::pos-device.pos-device').findMany({
      where: { device_token_hash: hash },
      populate: ['fk_user'],
      limit: 2,
    });

    if (devices.length === 0) {
      ctx.status = 401;
      ctx.body = { error: { code: 'DEVICE_TOKEN_INVALID', message: 'Token non riconosciuto' } };
      return;
    }
    if (devices.length > 1) {
      // Collisione hash (praticamente impossibile): blocca per sicurezza.
      strapi.log.error('device-token middleware: collisione hash su più device, blocco.');
      ctx.status = 500;
      ctx.body = { error: { code: 'DEVICE_TOKEN_COLLISION', message: 'Errore interno' } };
      return;
    }

    const device = devices[0];

    if (device.revoked_at) {
      ctx.status = 401;
      ctx.body = { error: { code: 'DEVICE_REVOKED', message: 'Device revocato' } };
      return;
    }
    if (!device.fk_user) {
      ctx.status = 401;
      ctx.body = { error: { code: 'DEVICE_ORPHANED', message: 'Device senza utente' } };
      return;
    }

    // Esponi al controller senza campi sensibili
    ctx.state.device = {
      id: device.id,
      documentId: device.documentId,
      name: device.name,
      fingerprint: device.fingerprint,
      version: device.version,
      fk_user: device.fk_user,
    };

    await next();
  };
};
