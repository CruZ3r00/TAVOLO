'use strict';

const crypto = require('crypto');
const { AppError, CODES } = require('./errors');
const keystore = require('./keystore');

/**
 * Master key AES-256: ora gestita dal modulo `keystore.js` con priorità
 * OS keystore (DPAPI / Keychain / libsecret) e fallback scrypt.
 *
 * Il chiamante DEVE aver invocato `keystore.initMasterKey()` in startup
 * prima di usare encrypt/decrypt, altrimenti `getMasterKey()` lancia.
 */
function getMasterKey() {
  return keystore.getMasterKey();
}

function resetMasterKeyCache() {
  keystore.resetMasterKeyCache();
}

/**
 * Cifratura AES-256-GCM. Ritorna {iv, tag, ciphertext} come Buffer.
 * IV: 12 byte random. Tag: 16 byte.
 */
function encrypt(plaintext, key = getMasterKey()) {
  if (!(key instanceof Buffer) || key.length !== 32) {
    throw new AppError(CODES.CRYPTO_FAILED, 'Chiave non valida (serve Buffer 32 byte)');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const buf = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
  const ciphertext = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, tag, ciphertext };
}

function decrypt({ iv, tag, ciphertext }, key = getMasterKey()) {
  if (!(key instanceof Buffer) || key.length !== 32) {
    throw new AppError(CODES.CRYPTO_FAILED, 'Chiave non valida (serve Buffer 32 byte)');
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext;
  } catch (err) {
    throw new AppError(CODES.CRYPTO_FAILED, 'Decifratura fallita (tag invalido o dati corrotti)', {
      cause: err,
    });
  }
}

function encryptString(str) {
  const { iv, tag, ciphertext } = encrypt(str);
  return { iv, tag, ciphertext };
}

function decryptString(record) {
  return decrypt(record).toString('utf8');
}

function sha256Hex(input) {
  return crypto
    .createHash('sha256')
    .update(typeof input === 'string' ? input : JSON.stringify(input))
    .digest('hex');
}

function hmacSha256(key, input) {
  return crypto
    .createHmac('sha256', key)
    .update(typeof input === 'string' ? input : JSON.stringify(input))
    .digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hash del PIN locale con scrypt + salt random (mitigazione H-1).
 * Formato: `scrypt$<saltHex>$<hashHex>` (16 byte salt, 32 byte hash).
 * N=2^14 → ~50ms su laptop moderno. Throttle naturale contro bruteforce
 * online. Il rate-limit applicativo aggiunge un secondo strato.
 */
function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pin), salt, 32, {
    N: 1 << 14,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Verifica PIN. Supporta:
 *  - Formato nuovo `scrypt$salt$hash` (timing-safe)
 *  - Legacy 64-hex (sha256) per backward-compat: ritorna `{ ok, needsRehash }`
 *    in modo che il caller possa migrare a scrypt al primo unlock riuscito.
 */
function verifyPin(pin, stored) {
  if (typeof stored !== 'string' || !stored) return { ok: false, needsRehash: false };

  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return { ok: false, needsRehash: false };
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (salt.length !== 16 || expected.length !== 32) return { ok: false, needsRehash: false };
    const candidate = crypto.scryptSync(String(pin), salt, 32, {
      N: 1 << 14,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    if (candidate.length !== expected.length) return { ok: false, needsRehash: false };
    const ok = crypto.timingSafeEqual(candidate, expected);
    return { ok, needsRehash: false };
  }

  // Legacy: sha256 plain.
  if (/^[a-f0-9]{64}$/i.test(stored)) {
    const candidate = sha256Hex(String(pin));
    const ok = safeEqual(candidate, stored);
    return { ok, needsRehash: ok };
  }

  return { ok: false, needsRehash: false };
}

function randomPin(length = 6) {
  const digits = '0123456789';
  let out = '';
  const buf = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    out += digits[buf[i] % 10];
  }
  return out;
}

/**
 * Confronto constant-time per evitare timing attack.
 */
function safeEqual(a, b) {
  const ba = Buffer.isBuffer(a) ? a : Buffer.from(String(a));
  const bb = Buffer.isBuffer(b) ? b : Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * JSON canonicalizzato (chiavi ordinate) — usato per hashare payload in audit.
 */
function canonicalJSON(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJSON).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJSON(obj[k])).join(',') + '}';
}

module.exports = {
  encrypt,
  decrypt,
  encryptString,
  decryptString,
  sha256Hex,
  hmacSha256,
  randomToken,
  randomPin,
  safeEqual,
  canonicalJSON,
  getMasterKey,
  resetMasterKeyCache,
  hashPin,
  verifyPin,
};
