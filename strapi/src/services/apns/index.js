'use strict';

/**
 * APNs (Apple Push Notification service) — silent push wake-up per iOS app
 * pos-rt-service.
 *
 * Uso: l'app iOS non può tenere un WS persistente né fare polling regolare
 * in background (limiti iOS). Soluzione: APNs silent push (`content-available: 1`)
 * sveglia l'app per ~30s, durante i quali fa un polling singolo verso
 * /api/pos-devices/me/jobs e processa eventuali job pending.
 *
 * Configurazione (env):
 *   APNS_KEY_PATH      — path al file .p8 (key auth APNs)
 *   APNS_KEY_ID        — Key ID (10 chars) dalla console Apple Developer
 *   APNS_TEAM_ID       — Team ID (10 chars) dalla console Apple Developer
 *   APNS_BUNDLE_ID     — bundle id dell'app iOS (es. it.example.posrt)
 *   APNS_PRODUCTION    — "true" per APNs prod, "false" per sandbox (default: false)
 *
 * Se una di queste variabili manca → il service è no-op (silent skip).
 * Vincolo: `dispatchJob` non deve mai fallire per errori APNs (fire-and-forget).
 */

const fs = require('fs');

let _provider = null;
let _enabled = null; // tristate: null=non-controllato, true/false=cached
const _rateLimit = new Map(); // deviceId → lastSentAt(ms)
const RATE_LIMIT_MS = 5_000;

function isEnabled() {
  if (_enabled !== null) return _enabled;
  const required = ['APNS_KEY_PATH', 'APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_BUNDLE_ID'];
  for (const k of required) {
    if (!process.env[k]) {
      _enabled = false;
      return false;
    }
  }
  if (!fs.existsSync(process.env.APNS_KEY_PATH)) {
    _enabled = false;
    return false;
  }
  _enabled = true;
  return true;
}

function getProvider(strapi) {
  if (_provider) return _provider;
  if (!isEnabled()) return null;
  let apn;
  try {
    apn = require('@parse/node-apn');
  } catch (err) {
    strapi?.log?.warn(`apns: pacchetto @parse/node-apn non installato: ${err.message}`);
    _enabled = false;
    return null;
  }
  try {
    _provider = new apn.Provider({
      token: {
        key: process.env.APNS_KEY_PATH,
        keyId: process.env.APNS_KEY_ID,
        teamId: process.env.APNS_TEAM_ID,
      },
      production: String(process.env.APNS_PRODUCTION || 'false').toLowerCase() === 'true',
    });
    strapi?.log?.info('apns: provider inizializzato');
    return _provider;
  } catch (err) {
    strapi?.log?.error(`apns: init provider fallita: ${err.message}`);
    _enabled = false;
    return null;
  }
}

/**
 * Manda silent push a un device (iOS only). Fire-and-forget: non blocca
 * dispatchJob se fallisce. Rate-limited per device.
 *
 * @param {object} strapi
 * @param {object} device — pos-device row con { id, platform, apns_token }
 * @param {object} hint — opzionale, payload custom (es. { jobHint: 1 })
 * @returns {Promise<{ skipped?: boolean, reason?: string, sent?: boolean, failed?: any[] }>}
 */
async function pushWakeup(strapi, device, hint = { jobHint: 1 }) {
  if (!device || device.platform !== 'ios') {
    return { skipped: true, reason: 'platform not ios' };
  }
  if (!device.apns_token) {
    return { skipped: true, reason: 'no apns_token' };
  }
  const provider = getProvider(strapi);
  if (!provider) {
    return { skipped: true, reason: 'apns disabled' };
  }
  // Rate limit per device.
  const last = _rateLimit.get(device.id);
  const now = Date.now();
  if (last && now - last < RATE_LIMIT_MS) {
    return { skipped: true, reason: 'rate limit' };
  }
  _rateLimit.set(device.id, now);

  try {
    const apn = require('@parse/node-apn');
    const note = new apn.Notification();
    // Silent push: niente alert/badge/sound. Solo content-available.
    note.contentAvailable = true;
    note.priority = 5; // priorità bassa per silent (Apple richiede 5 per content-available)
    note.topic = process.env.APNS_BUNDLE_ID;
    note.expiry = Math.floor(now / 1000) + 60; // valido per 60s
    note.payload = { ...hint };

    const result = await provider.send(note, device.apns_token);
    if (result.failed && result.failed.length > 0) {
      const f = result.failed[0];
      strapi?.log?.warn(
        `apns: push fallita device=${device.id} status=${f.status} reason=${JSON.stringify(f.response || {})}`,
      );
      return { sent: false, failed: result.failed };
    }
    return { sent: true };
  } catch (err) {
    strapi?.log?.warn(`apns: push exception device=${device.id}: ${err.message}`);
    return { sent: false, error: err.message };
  }
}

function shutdown() {
  if (_provider) {
    try { _provider.shutdown(); } catch (_) {}
  }
  _provider = null;
  _enabled = null;
  _rateLimit.clear();
}

module.exports = {
  isEnabled,
  pushWakeup,
  shutdown,
};
