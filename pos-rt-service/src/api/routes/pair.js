'use strict';

const express = require('express');
const { pair, pairByToken, unpair } = require('../../modules/pairing');
const { requireLocalPin } = require('../middleware/local-auth');
const deviceRepo = require('../../storage/repositories/deviceRepo');
const { AppError, CODES } = require('../../utils/errors');
const { getLogger } = require('../../utils/logger');
const { verifyClaimCode, clearClaimCode, ensureClaimCode } = require('../../utils/claim-code');

const log = getLogger('api/pair');

function buildRouter({ onPaired, config }) {
  const router = express.Router();

  /**
   * POST /pair — first-run. Richiede header `X-Pairing-Claim-Code` (mitigazione C-3).
   * Il claim-code è scritto da `ensureClaimCode()` in un file 0600 nel DataDir
   * del servizio: solo chi ha accesso al filesystem privilegiato (installer / admin)
   * può leggerlo. Senza questo gate, qualunque processo locale unprivileged
   * potrebbe pairare il device verso uno Strapi malevolo.
   *
   * Se già pairato e ALLOW_RE_PAIR=false → 409.
   */
  router.post('/', async (req, res) => {
    try {
      if (deviceRepo.isPaired() && !config.api.allowRePair) {
        throw new AppError(CODES.ALREADY_PAIRED, 'Dispositivo già registrato', { httpStatus: 409 });
      }
      const claimCode = req.get('X-Pairing-Claim-Code') || req.body?.claim_code;
      if (!verifyClaimCode(claimCode)) {
        throw new AppError(
          CODES.PAIRING_CLAIM_REQUIRED,
          'Claim-code di pairing mancante o errato. Recuperalo dal file `.claim-code` nella cartella dati del servizio.',
          { httpStatus: 401 },
        );
      }
      const result = await pair(req.body || {}, { allowInsecure: config.strapi.allowInsecure });
      // Pairing OK → consume il claim-code (one-shot)
      clearClaimCode();
      if (typeof onPaired === 'function') {
        try {
          await onPaired(result);
        } catch (e) {
          log.warn({ err: e }, 'onPaired callback errore');
        }
      }
      res.status(201).json({ data: result });
    } catch (err) {
      const status = err.httpStatus || 500;
      res.status(status).json(err.toJSON ? err.toJSON() : { code: 'INTERNAL', message: err.message });
    }
  });

  /**
   * POST /pair/by-token — first-run via pairing-token (Fase 5).
   * Più semplice del flow classico: niente credenziali Strapi nell'installer,
   * il token (single-use, TTL 30min) sostituisce email+password.
   * Comunque gated da claim-code per il problema "first-run race" (C-3).
   */
  router.post('/by-token', async (req, res) => {
    try {
      if (deviceRepo.isPaired() && !config.api.allowRePair) {
        throw new AppError(CODES.ALREADY_PAIRED, 'Dispositivo già registrato', { httpStatus: 409 });
      }
      const claimCode = req.get('X-Pairing-Claim-Code') || req.body?.claim_code;
      if (!verifyClaimCode(claimCode)) {
        throw new AppError(
          CODES.PAIRING_CLAIM_REQUIRED,
          'Claim-code di pairing mancante o errato. Recuperalo dal file `.claim-code` nella cartella dati del servizio.',
          { httpStatus: 401 },
        );
      }
      const result = await pairByToken(req.body || {}, { allowInsecure: config.strapi.allowInsecure });
      clearClaimCode();
      if (typeof onPaired === 'function') {
        try { await onPaired(result); } catch (e) { log.warn({ err: e }, 'onPaired callback errore'); }
      }
      res.status(201).json({ data: result });
    } catch (err) {
      const status = err.httpStatus || 500;
      res.status(status).json(err.toJSON ? err.toJSON() : { code: 'INTERNAL', message: err.message });
    }
  });

  /**
   * POST /unpair — richiede PIN.
   */
  router.post('/unpair', requireLocalPin, async (req, res) => {
    try {
      const result = await unpair();
      res.json({ data: result });
    } catch (err) {
      const status = err.httpStatus || 500;
      res.status(status).json(err.toJSON ? err.toJSON() : { code: 'INTERNAL', message: err.message });
    }
  });

  return router;
}

module.exports = { buildRouter };
