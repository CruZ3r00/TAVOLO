'use strict';

/**
 * Rate limiter in-memory (windowMs, max). Per-IP (sempre 127.0.0.1 ma dpeb).
 */
function rateLimit({ windowMs = 60_000, max = 30 } = {}) {
  const buckets = new Map();
  return function (req, res, next) {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return res.status(429).json({ code: 'RATE_LIMITED', message: 'Troppe richieste' });
    }
    next();
  };
}

module.exports = { rateLimit };
