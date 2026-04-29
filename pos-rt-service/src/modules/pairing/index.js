'use strict';

const axios = require('axios');
const os = require('os');
const { getLogger } = require('../../utils/logger');
const { AppError, CODES } = require('../../utils/errors');
const { getMachineFingerprint } = require('../../utils/machine');
const { randomPin } = require('../../utils/crypto');
const deviceRepo = require('../../storage/repositories/deviceRepo');
const secretsRepo = require('../../storage/repositories/secretsRepo');
const configRepo = require('../../storage/repositories/configRepo');
const auditRepo = require('../../storage/repositories/auditRepo');
const { parseOrThrow, pairSchema, pairByTokenSchema } = require('../../utils/validation');

const log = getLogger('modules/pairing');

/**
 * Esegue il pairing con Strapi:
 *   1. login JWT utente
 *   2. register device → ottiene device_token
 *   3. salva url + token cifrato in DB
 *   4. genera PIN locale (mostrato UNA volta) e lo salva hashato
 */
async function pair({ strapi_url, email, password, device_name }, { allowInsecure = false } = {}) {
  parseOrThrow(pairSchema, { strapi_url, email, password, device_name });

  if (deviceRepo.isPaired() && !process.env.ALLOW_RE_PAIR) {
    throw new AppError(CODES.ALREADY_PAIRED, 'Dispositivo già registrato. Usa /unpair prima di ri-fare pairing.', { httpStatus: 409 });
  }

  const url = strapi_url.replace(/\/+$/, '');
  if (!allowInsecure && !/^https:\/\//i.test(url)) {
    throw new AppError(CODES.PAIRING_FAILED, 'Solo HTTPS consentito verso Strapi (set ALLOW_INSECURE=true in dev)', { httpStatus: 400 });
  }

  const fingerprint = getMachineFingerprint();
  const name = device_name || `${os.hostname()}-${os.platform()}`;

  log.info({ url, name }, 'Avvio pairing');

  let jwt;
  try {
    const loginRes = await axios.post(
      `${url}/api/auth/local`,
      { identifier: email, password },
      { timeout: 15_000, validateStatus: () => true },
    );
    if (loginRes.status !== 200 || !loginRes.data?.jwt) {
      throw new AppError(
        CODES.STRAPI_AUTH_FAILED,
        `Login Strapi fallito (${loginRes.status}): ${loginRes.data?.error?.message || 'credenziali invalide'}`,
        { httpStatus: 401 },
      );
    }
    jwt = loginRes.data.jwt;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(CODES.STRAPI_UNAVAILABLE, `Errore contattando Strapi: ${err.message}`, {
      httpStatus: 503,
      cause: err,
    });
  }

  let registration;
  try {
    const regRes = await axios.post(
      `${url}/api/pos-devices/register`,
      { name, fingerprint },
      {
        timeout: 15_000,
        headers: { Authorization: `Bearer ${jwt}` },
        validateStatus: () => true,
      },
    );
    if (regRes.status !== 201 && regRes.status !== 200) {
      throw new AppError(
        CODES.PAIRING_FAILED,
        `Registrazione device fallita (${regRes.status}): ${JSON.stringify(regRes.data)}`,
        { httpStatus: regRes.status, details: regRes.data },
      );
    }
    registration = regRes.data?.data || regRes.data;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(CODES.PAIRING_FAILED, `Errore durante register: ${err.message}`, {
      httpStatus: 503,
      cause: err,
    });
  }

  const deviceToken = registration.device_token;
  const wsUrl = registration.ws_url || deriveWsUrl(url);
  if (!deviceToken) {
    throw new AppError(CODES.PAIRING_FAILED, 'Strapi non ha restituito device_token');
  }

  // Persist
  secretsRepo.set('device_token', deviceToken);
  deviceRepo.save({ strapi_url: url, ws_url: wsUrl, name, fingerprint });

  // Genera PIN locale
  const pin = randomPin(6);
  const { hashPin } = require('../../utils/crypto');
  configRepo.set('local_pin_hash', hashPin(pin));

  auditRepo.append({
    kind: 'device.paired',
    payload: { strapi_url: url, name },
    meta: { fingerprint },
  });

  log.info('Pairing completato');
  return {
    strapi_url: url,
    ws_url: wsUrl,
    name,
    local_pin: pin,
    device_document_id: registration.documentId || null,
  };
}

function deriveWsUrl(httpUrl) {
  return httpUrl.replace(/^http/i, 'ws') + '/ws/pos';
}

/**
 * Pairing tramite token single-use generato dalla pagina profilo Vue.
 * Più sicuro di email+password: niente credenziali Strapi nell'installer,
 * il token scade in 30min e si consuma al primo uso.
 *
 *   1. Server-side ha già creato la riga `pos-pairing-token` (sha256(token)).
 *   2. Il device chiama POST /api/pos-devices/register-by-token col token.
 *   3. Strapi: verifica TTL + non-consumato, crea device, ritorna device_token.
 *   4. Persistiamo come nel flow classico.
 */
async function pairByToken({ strapi_url, pairing_token, device_name }, { allowInsecure = false } = {}) {
  parseOrThrow(pairByTokenSchema, { strapi_url, pairing_token, device_name });

  if (deviceRepo.isPaired() && !process.env.ALLOW_RE_PAIR) {
    throw new AppError(CODES.ALREADY_PAIRED, 'Dispositivo già registrato. Usa /unpair prima di ri-fare pairing.', { httpStatus: 409 });
  }

  const url = strapi_url.replace(/\/+$/, '');
  if (!allowInsecure && !/^https:\/\//i.test(url)) {
    throw new AppError(CODES.PAIRING_FAILED, 'Solo HTTPS consentito (set ALLOW_INSECURE=true in dev)', { httpStatus: 400 });
  }

  const fingerprint = getMachineFingerprint();
  const name = device_name || `${os.hostname()}-${os.platform()}`;
  const platform = os.platform() === 'win32' ? 'windows'
    : os.platform() === 'darwin' ? 'macos'
    : os.platform() === 'linux' ? 'linux'
    : 'other';

  log.info({ url, name, platform }, 'Avvio pairing-by-token');

  let registration;
  try {
    const regRes = await axios.post(
      `${url}/api/pos-devices/register-by-token`,
      { token: pairing_token, name, fingerprint, platform },
      { timeout: 15_000, validateStatus: () => true },
    );
    if (regRes.status === 404) {
      throw new AppError(CODES.PAIRING_FAILED, 'Token non valido. Genera un nuovo token dalla pagina profilo.', { httpStatus: 401, details: regRes.data });
    }
    if (regRes.status === 409) {
      throw new AppError(CODES.PAIRING_FAILED, 'Token già usato. Genera un nuovo token.', { httpStatus: 409, details: regRes.data });
    }
    if (regRes.status !== 201 && regRes.status !== 200) {
      throw new AppError(CODES.PAIRING_FAILED, `register-by-token fallita (${regRes.status})`, { httpStatus: regRes.status, details: regRes.data });
    }
    registration = regRes.data?.data || regRes.data;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(CODES.STRAPI_UNAVAILABLE, `Errore contattando Strapi: ${err.message}`, { httpStatus: 503, cause: err });
  }

  const deviceToken = registration.device_token;
  const wsUrl = registration.ws_url || deriveWsUrl(url);
  if (!deviceToken) {
    throw new AppError(CODES.PAIRING_FAILED, 'Strapi non ha restituito device_token');
  }

  secretsRepo.set('device_token', deviceToken);
  deviceRepo.save({ strapi_url: url, ws_url: wsUrl, name, fingerprint });

  const pin = randomPin(6);
  const { hashPin } = require('../../utils/crypto');
  configRepo.set('local_pin_hash', hashPin(pin));

  auditRepo.append({
    kind: 'device.paired_by_token',
    payload: { strapi_url: url, name, platform },
    meta: { fingerprint },
  });

  log.info('Pairing-by-token completato');
  return {
    strapi_url: url,
    ws_url: wsUrl,
    name,
    local_pin: pin,
    device_document_id: registration.documentId || null,
  };
}

async function unpair() {
  const device = deviceRepo.get();
  if (!device) {
    throw new AppError(CODES.NOT_PAIRED, 'Dispositivo non registrato', { httpStatus: 409 });
  }
  secretsRepo.wipe();
  deviceRepo.clear();
  configRepo.remove('local_pin_hash');
  // Rigenera il claim-code: il prossimo pairing dovrà presentarlo (mitigazione C-3).
  try {
    const { ensureClaimCode } = require('../../utils/claim-code');
    ensureClaimCode({ regenerate: true });
  } catch (err) {
    log.warn({ err: err.message }, 'Rigenerazione claim-code post-unpair fallita');
  }
  auditRepo.append({
    kind: 'device.unpaired',
    payload: { strapi_url: device.strapi_url, name: device.name },
  });
  log.info('Unpair completato');
  return { ok: true };
}

function getDeviceToken() {
  const token = secretsRepo.get('device_token');
  if (!token) throw new AppError(CODES.NOT_PAIRED, 'Device non registrato');
  return token;
}

module.exports = { pair, pairByToken, unpair, getDeviceToken };
