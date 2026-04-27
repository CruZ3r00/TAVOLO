'use strict';

const configRepo = require('../../storage/repositories/configRepo');
const { verifyPin, hashPin } = require('../../utils/crypto');
const { CODES } = require('../../utils/errors');
const { getLogger } = require('../../utils/logger');

const log = getLogger('api/middleware/local-auth');

/**
 * Middleware: richiede header X-Local-Pin che matcha `local_pin_hash` in DB.
 * - Hash con scrypt + salt per record (vedi H-1 nel security review).
 * - Auto-migrazione di hash legacy (sha256 plain) al primo unlock riuscito.
 * - Se PIN non impostato (pre-pairing): allow solo con `req._allowUnauth`.
 */
function requireLocalPin(req, res, next) {
  if (req._allowUnauth) return next();

  const stored = configRepo.get('local_pin_hash');
  if (!stored) {
    return res.status(503).json({
      code: 'NOT_CONFIGURED',
      message: 'PIN locale non impostato (completa il pairing)',
    });
  }
  const pin = req.get('X-Local-Pin') || '';
  if (!pin) {
    return res.status(401).json({ code: CODES.LOCAL_AUTH_FAILED, message: 'X-Local-Pin mancante' });
  }

  const { ok, needsRehash } = verifyPin(pin, stored);
  if (!ok) {
    return res.status(401).json({ code: CODES.LOCAL_AUTH_FAILED, message: 'PIN errato' });
  }
  if (needsRehash) {
    try {
      configRepo.set('local_pin_hash', hashPin(pin));
      log.info('PIN ri-hashato in formato scrypt (migrazione H-1)');
    } catch (err) {
      log.warn({ err: err.message }, 'Rehash PIN fallito (continuo comunque)');
    }
  }
  next();
}

module.exports = { requireLocalPin };
