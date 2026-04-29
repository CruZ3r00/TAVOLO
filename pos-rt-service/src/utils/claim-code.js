'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getAppDataDir, ensureDir } = require('./machine');
const { getLogger } = require('./logger');

const log = getLogger('utils/claim-code');

/**
 * Claim-code per il primo pairing (mitigazione C-3 nel security review).
 *
 * Il problema: `POST /pair` non può richiedere autenticazione perché il PIN/token
 * non esistono ancora. Senza un gating ulteriore, qualsiasi processo locale
 * (anche unprivileged) può "battere sul tempo" l'utente legittimo e dirottare
 * il device verso uno Strapi malevolo.
 *
 * La soluzione: al primo avvio (o dopo unpair), il servizio scrive un token
 * casuale in un file con permessi `0600` nella cartella dati applicativa
 * (`%PROGRAMDATA%\PosRtService\.claim-code`, `~/.local/share/pos-rt-service/.claim-code`,
 * `~/Library/Application Support/PosRtService/.claim-code`). Solo chi ha
 * accesso a quel file (admin / installer / utente loggato) può leggere il
 * codice. La UI di pairing (lanciata dall'installer / dall'utente con privilegi
 * appropriati) lo passa nell'header `X-Pairing-Claim-Code`.
 *
 * Su Windows i mode bit `0600` non si traducono in ACL: ci affidiamo alla
 * protezione ACL ereditata dalla cartella DataDir (impostata dall'installer).
 */

const FILE_NAME = '.claim-code';

function getClaimCodePath() {
  return path.join(getAppDataDir(), FILE_NAME);
}

/**
 * Genera un nuovo claim-code (32 byte hex) e lo scrive su disco.
 * Sovrascrive eventuali file esistenti.
 */
function generateClaimCode() {
  const code = crypto.randomBytes(32).toString('hex');
  const filePath = getClaimCodePath();
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, code, { mode: 0o600 });
  // Su POSIX rinforza i permessi anche se il file esisteva già.
  try {
    fs.chmodSync(filePath, 0o600);
  } catch (_) {
    // su Windows può fallire silenziosamente — ACL della parent dir è la difesa
  }
  log.info({ path: filePath }, 'Claim-code generato');
  return code;
}

/**
 * Restituisce il claim-code corrente, generandolo se non esiste.
 * Se `regenerate` è true, lo rigenera comunque.
 */
function ensureClaimCode({ regenerate = false } = {}) {
  const filePath = getClaimCodePath();
  if (!regenerate && fs.existsSync(filePath)) {
    try {
      const buf = fs.readFileSync(filePath, 'utf8').trim();
      if (/^[a-f0-9]{64}$/i.test(buf)) return buf;
      log.warn({ path: filePath }, 'Claim-code esistente non valido, rigenero');
    } catch (err) {
      log.warn({ err: err.message }, 'Lettura claim-code fallita, rigenero');
    }
  }
  return generateClaimCode();
}

/**
 * Verifica un claim-code fornito dal client. Compare timing-safe.
 * Ritorna true/false.
 */
function verifyClaimCode(provided) {
  if (typeof provided !== 'string') return false;
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false;
  const filePath = getClaimCodePath();
  if (!fs.existsSync(filePath)) return false;
  try {
    const expected = fs.readFileSync(filePath, 'utf8').trim();
    if (!/^[a-f0-9]{64}$/i.test(expected)) return false;
    const a = Buffer.from(provided.toLowerCase(), 'hex');
    const b = Buffer.from(expected.toLowerCase(), 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    log.warn({ err: err.message }, 'Verify claim-code error');
    return false;
  }
}

/**
 * Cancella il claim-code dopo un pairing riuscito (one-shot).
 * Idempotente.
 */
function clearClaimCode() {
  const filePath = getClaimCodePath();
  try {
    fs.unlinkSync(filePath);
    log.info('Claim-code rimosso (consumed)');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      log.warn({ err: err.message }, 'Rimozione claim-code fallita');
    }
  }
}

module.exports = {
  getClaimCodePath,
  generateClaimCode,
  ensureClaimCode,
  verifyClaimCode,
  clearClaimCode,
};
