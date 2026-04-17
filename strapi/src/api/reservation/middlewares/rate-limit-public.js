'use strict';

/**
 * Rate limit middleware per la route pubblica di prenotazione.
 *
 * Best-effort in-memory: mantiene una mappa `key -> [timestamps]`, dove la
 * chiave combina IP + userDocumentId del ristorante. La finestra e il
 * limite sono configurabili via env:
 *   - RESERVATION_RATE_LIMIT_WINDOW_MS  (default 600000 = 10 minuti)
 *   - RESERVATION_RATE_LIMIT_MAX        (default 5)
 *
 * Non sostituisce un rate-limit distribuito (che richiederebbe Redis); è
 * pensato per disincentivare spam banali dal sito vetrina in v1.
 */

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX = 5;

const buckets = new Map();

function getWindowMs() {
  const raw = parseInt(process.env.RESERVATION_RATE_LIMIT_WINDOW_MS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_WINDOW_MS;
}

function getMax() {
  const raw = parseInt(process.env.RESERVATION_RATE_LIMIT_MAX || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX;
}

function extractClientIp(ctx) {
  const xff = ctx.request.headers['x-forwarded-for'];
  if (xff && typeof xff === 'string') {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  return ctx.request.ip || ctx.ip || 'unknown';
}

function prune(timestamps, windowStart) {
  let i = 0;
  while (i < timestamps.length && timestamps[i] < windowStart) i += 1;
  if (i > 0) timestamps.splice(0, i);
}

module.exports = (_config, { strapi }) => {
  return async (ctx, next) => {
    const windowMs = getWindowMs();
    const max = getMax();
    const now = Date.now();
    const windowStart = now - windowMs;

    const ip = extractClientIp(ctx);
    const targetId = ctx.params && ctx.params.userDocumentId ? ctx.params.userDocumentId : 'all';
    const key = `${ip}::${targetId}`;

    const timestamps = buckets.get(key) || [];
    prune(timestamps, windowStart);

    if (timestamps.length >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((timestamps[0] + windowMs - now) / 1000));
      ctx.set('Retry-After', String(retryAfterSec));
      ctx.status = 429;
      ctx.body = {
        error: {
          code: 'RATE_LIMITED',
          message: 'Troppe richieste. Riprova più tardi.',
          details: { retry_after_seconds: retryAfterSec },
        },
      };
      strapi.log.warn(`rate-limit-public: ip=${ip} target=${targetId} blocked.`);
      return;
    }

    timestamps.push(now);
    buckets.set(key, timestamps);

    await next();
  };
};
