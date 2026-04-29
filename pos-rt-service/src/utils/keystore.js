'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getAppDataDir, getMasterKeyMaterial } = require('./machine');
const { getLogger } = require('./logger');
const { AppError, CODES } = require('./errors');

const log = getLogger('utils/keystore');

/**
 * Master key resolver con priorità:
 *   1. OS keystore (DPAPI / Keychain / libsecret) via keytar
 *   2. Fallback derivato (scrypt(fingerprint, salt)) — meno sicuro, segnalato in audit
 *
 * Mitigazione C-4 nel security review. Il problema del fallback rimane:
 * la chiave deriva da dati ottenibili con accesso al disco. Ma:
 *  - su Windows il servizio in produzione gira con DPAPI disponibile
 *  - su macOS Keychain è sempre disponibile
 *  - solo Linux headless senza secret-service usa il fallback
 *
 * In quel caso il logger emette un WARN e auditRepo riceve `keystore.fallback`.
 *
 * API sincrona dopo `initMasterKey()`: tutto il codice esistente che chiama
 * `getMasterKey()` continua a funzionare in modo sync.
 */

const SERVICE_NAME = 'pos-rt-service';
const ACCOUNT_NAME = 'master-key';

let _masterKey = null;
let _backend = null; // 'os-keystore' | 'fallback-scrypt'

let _keytar = null;
function tryRequireKeytar() {
  if (_keytar !== null) return _keytar;
  try {
    _keytar = require('keytar');
  } catch (err) {
    log.warn({ err: err.message }, 'keytar non disponibile (build mancante?)');
    _keytar = false;
  }
  return _keytar || null;
}

async function readFromOsKeystore() {
  const k = tryRequireKeytar();
  if (!k) return null;
  try {
    const hex = await k.getPassword(SERVICE_NAME, ACCOUNT_NAME);
    if (!hex) return null;
    if (!/^[a-f0-9]{64}$/i.test(hex)) {
      log.warn('Master key in OS keystore non ha formato atteso (64 hex), ignoro');
      return null;
    }
    return Buffer.from(hex, 'hex');
  } catch (err) {
    log.warn({ err: err.message }, 'OS keystore non raggiungibile');
    return null;
  }
}

async function writeToOsKeystore(key) {
  const k = tryRequireKeytar();
  if (!k) return false;
  try {
    await k.setPassword(SERVICE_NAME, ACCOUNT_NAME, key.toString('hex'));
    return true;
  } catch (err) {
    log.warn({ err: err.message }, 'Scrittura OS keystore fallita');
    return false;
  }
}

function deriveFallbackKey() {
  const { salt, fingerprint } = getMasterKeyMaterial();
  return crypto.scryptSync(fingerprint, salt, 32, {
    N: 1 << 15,
    r: 8,
    p: 1,
    maxmem: 128 * 1024 * 1024,
  });
}

/**
 * Inizializza la master key. Chiamare UNA volta all'avvio del servizio,
 * prima di qualsiasi accesso a secretsRepo / encrypt / decrypt.
 *
 * Side effect: scrive un marker file `.keystore-backend` nella DataDir per
 * tracciare quale backend è in uso. Utile per migrazioni future.
 */
async function initMasterKey({ forceFallback = false } = {}) {
  if (_masterKey) return { backend: _backend };

  if (!forceFallback) {
    let existing = await readFromOsKeystore();
    if (existing) {
      _masterKey = existing;
      _backend = 'os-keystore';
      log.info('Master key letta da OS keystore');
      writeBackendMarker(_backend);
      return { backend: _backend };
    }

    // Nessuna chiave nel keystore: provo a generarne una nuova e a salvarla.
    const candidate = crypto.randomBytes(32);
    const ok = await writeToOsKeystore(candidate);
    if (ok) {
      _masterKey = candidate;
      _backend = 'os-keystore';
      log.info('Master key generata e salvata in OS keystore');
      writeBackendMarker(_backend);
      return { backend: _backend };
    }
  }

  // Fallback: scheme legacy (scrypt fingerprint+salt).
  log.warn(
    'OS keystore non disponibile o forzato fallback. Uso master key derivata (meno sicura). ' +
      'Setup atteso: Windows DPAPI / macOS Keychain / Linux libsecret.',
  );
  _masterKey = deriveFallbackKey();
  _backend = 'fallback-scrypt';
  writeBackendMarker(_backend);
  return { backend: _backend };
}

function writeBackendMarker(backend) {
  try {
    const p = path.join(getAppDataDir(), '.keystore-backend');
    fs.writeFileSync(p, backend, { mode: 0o600 });
  } catch (err) {
    log.debug({ err: err.message }, 'Impossibile scrivere marker keystore');
  }
}

function getMasterKey() {
  if (!_masterKey) {
    throw new AppError(
      CODES.CRYPTO_FAILED,
      'Master key non inizializzata. Chiamare initMasterKey() in startup.',
    );
  }
  return _masterKey;
}

function getBackend() {
  return _backend;
}

function resetMasterKeyCache() {
  _masterKey = null;
  _backend = null;
}

module.exports = {
  initMasterKey,
  getMasterKey,
  getBackend,
  resetMasterKeyCache,
};
