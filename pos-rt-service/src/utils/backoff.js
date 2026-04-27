'use strict';

/**
 * Exponential backoff con jitter ±25%.
 *
 *   attempt 0 -> base
 *   attempt n -> base * factor^n (capped at cap)
 *
 * Ritorna millisecondi.
 */
function exponentialBackoff(attempt, { base = 1000, factor = 2, cap = 30000, jitter = 0.25 } = {}) {
  const raw = Math.min(cap, base * Math.pow(factor, Math.max(0, attempt)));
  const j = raw * jitter;
  const offset = (Math.random() * 2 - 1) * j;
  return Math.max(0, Math.round(raw + offset));
}

/**
 * Sequenza predefinita per retry coda: 30s, 2m, 10m, 1h, 6h, 24h.
 * Ritorna ms in base all'indice (clampato all'ultimo).
 */
const QUEUE_RETRY_SCHEDULE_MS = [
  30 * 1000,
  2 * 60 * 1000,
  10 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
];

function queueRetryDelayMs(attempt) {
  const idx = Math.min(attempt, QUEUE_RETRY_SCHEDULE_MS.length - 1);
  const base = QUEUE_RETRY_SCHEDULE_MS[idx];
  const jitter = base * 0.25;
  const offset = (Math.random() * 2 - 1) * jitter;
  return Math.max(0, Math.round(base + offset));
}

/**
 * Sequenza per riconnessione WebSocket: 1s, 2s, 4s, 8s, 15s, 30s (max).
 */
function wsReconnectDelayMs(attempt) {
  const schedule = [1000, 2000, 4000, 8000, 15000, 30000];
  const idx = Math.min(attempt, schedule.length - 1);
  const base = schedule[idx];
  const jitter = base * 0.25;
  return Math.max(0, Math.round(base + (Math.random() * 2 - 1) * jitter));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  exponentialBackoff,
  queueRetryDelayMs,
  wsReconnectDelayMs,
  sleep,
  QUEUE_RETRY_SCHEDULE_MS,
};
