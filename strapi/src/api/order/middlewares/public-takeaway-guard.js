'use strict';

const crypto = require('crypto');

const DEFAULT_RATE_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_RATE_MAX = 5;
const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_IDEMPOTENCY_RECORDS = 5000;

const rateBuckets = new Map();
const idempotencyCache = new Map();

function positiveIntEnv(name, fallback) {
  const raw = parseInt(process.env[name] || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function extractClientIp(ctx) {
  const trustProxy = process.env.TRUST_PROXY === 'true';
  const xff = trustProxy ? ctx.request.headers['x-forwarded-for'] : null;
  if (xff && typeof xff === 'string') {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  return ctx.request.ip || ctx.ip || 'unknown';
}

function pruneRateBucket(timestamps, windowStart) {
  let i = 0;
  while (i < timestamps.length && timestamps[i] < windowStart) i += 1;
  if (i > 0) timestamps.splice(0, i);
}

function pruneIdempotencyCache(now) {
  for (const [key, entry] of idempotencyCache.entries()) {
    if (!entry || entry.expiresAt <= now) idempotencyCache.delete(key);
  }

  if (idempotencyCache.size <= MAX_IDEMPOTENCY_RECORDS) return;
  const overflow = idempotencyCache.size - MAX_IDEMPOTENCY_RECORDS;
  const keys = Array.from(idempotencyCache.keys()).slice(0, overflow);
  for (const key of keys) idempotencyCache.delete(key);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      if (key !== 'idempotency_key') acc[key] = canonicalize(value[key]);
      return acc;
    }, {});
}

function requestFingerprint(ctx) {
  const payload = {
    method: ctx.method,
    path: ctx.path,
    body: canonicalize(ctx.request.body || {}),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function idempotencyKey(ctx) {
  const header = ctx.request.headers['idempotency-key'];
  const bodyKey = ctx.request.body && ctx.request.body.idempotency_key;
  const key = String(header || bodyKey || '').trim();
  if (!key) return '';
  if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(key)) return null;
  return key;
}

module.exports = (_config, { strapi }) => {
  return async (ctx, next) => {
    const now = Date.now();
    const ip = extractClientIp(ctx);
    const targetId = ctx.params && ctx.params.userDocumentId ? ctx.params.userDocumentId : 'all';

    const idemKey = idempotencyKey(ctx);
    if (idemKey === null) {
      ctx.status = 400;
      ctx.body = {
        error: {
          code: 'INVALID_IDEMPOTENCY_KEY',
          message: 'Idempotency-Key non valida.',
        },
      };
      return;
    }

    pruneIdempotencyCache(now);
    const fingerprint = requestFingerprint(ctx);
    const cacheKey = idemKey ? `${targetId}::${idemKey}` : '';
    if (cacheKey) {
      const cached = idempotencyCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        if (cached.fingerprint !== fingerprint) {
          ctx.status = 409;
          ctx.body = {
            error: {
              code: 'IDEMPOTENCY_KEY_REUSED',
              message: 'Idempotency-Key già usata con un payload diverso.',
            },
          };
          return;
        }
        ctx.set('Idempotency-Replayed', 'true');
        ctx.status = cached.status;
        ctx.body = cached.body;
        return;
      }
    }

    const windowMs = positiveIntEnv('TAKEAWAY_RATE_LIMIT_WINDOW_MS', DEFAULT_RATE_WINDOW_MS);
    const max = positiveIntEnv('TAKEAWAY_RATE_LIMIT_MAX', DEFAULT_RATE_MAX);
    const windowStart = now - windowMs;
    const rateKey = `${ip}::${targetId}`;
    const timestamps = rateBuckets.get(rateKey) || [];
    pruneRateBucket(timestamps, windowStart);

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
      strapi.log.warn(`public-takeaway-guard: ip=${ip} target=${targetId} blocked.`);
      return;
    }

    timestamps.push(now);
    rateBuckets.set(rateKey, timestamps);

    await next();

    if (cacheKey && ctx.status >= 200 && ctx.status < 300) {
      const ttlMs = positiveIntEnv('TAKEAWAY_IDEMPOTENCY_TTL_MS', DEFAULT_IDEMPOTENCY_TTL_MS);
      idempotencyCache.set(cacheKey, {
        fingerprint,
        status: ctx.status,
        body: ctx.body,
        expiresAt: Date.now() + ttlMs,
      });
    }
  };
};
