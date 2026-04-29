'use strict';

require('dotenv').config();

const defaults = require('./defaults');

function num(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function list(v, fallback) {
  if (!v) return fallback;
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Merge: defaults <- env. Il merge con valori DB avviene dopo l'apertura del DB
 * (vedi mergeDbOverrides).
 */
function loadConfig() {
  const env = process.env;
  return {
    logLevel: env.LOG_LEVEL || defaults.logLevel,

    api: {
      host: env.LOCAL_API_HOST || defaults.api.host,
      port: num(env.LOCAL_API_PORT, defaults.api.port),
      rateLimit: { ...defaults.api.rateLimit },
      allowRePair: bool(env.ALLOW_RE_PAIR, defaults.api.allowRePair),
    },

    strapi: {
      url: env.STRAPI_URL || defaults.strapi.url,
      wsUrl: env.STRAPI_WS_URL || defaults.strapi.wsUrl,
      allowInsecure: bool(env.ALLOW_INSECURE, defaults.strapi.allowInsecure),
      trustedCertFingerprints: list(
        env.TRUSTED_CERT_FINGERPRINTS,
        defaults.strapi.trustedCertFingerprints,
      ),
      requestTimeoutMs: num(env.STRAPI_REQUEST_TIMEOUT_MS, defaults.strapi.requestTimeoutMs),
    },

    scheduler: {
      pollWsConnectedS: num(env.POLL_INTERVAL_WS_CONNECTED_S, defaults.scheduler.pollWsConnectedS),
      pollWsDisconnectedS: num(
        env.POLL_INTERVAL_WS_DISCONNECTED_S,
        defaults.scheduler.pollWsDisconnectedS,
      ),
      heartbeatS: num(env.HEARTBEAT_INTERVAL_S, defaults.scheduler.heartbeatS),
      wsReconnectCheckS: num(env.WS_RECONNECT_CHECK_S, defaults.scheduler.wsReconnectCheckS),
      cleanupCron: env.CLEANUP_CRON || defaults.scheduler.cleanupCron,
      verifyAuditCron: env.VERIFY_AUDIT_CRON || defaults.scheduler.verifyAuditCron,
    },

    drivers: {
      printer: env.PRINTER_DRIVER || defaults.drivers.printer,
      payment: env.PAYMENT_DRIVER || defaults.drivers.payment,
      stub: {
        latencyMs: num(env.STUB_LATENCY_MS, defaults.drivers.stub.latencyMs),
        failureRate: num(env.STUB_FAILURE_RATE, defaults.drivers.stub.failureRate),
      },
    },

    queue: {
      maxAttempts: num(env.MAX_JOB_ATTEMPTS, defaults.queue.maxAttempts),
      maxSize: num(env.MAX_QUEUE_SIZE, defaults.queue.maxSize),
      dispatchBatch: defaults.queue.dispatchBatch,
      concurrency: defaults.queue.concurrency,
    },

    audit: {
      retentionFiscalDays: num(
        env.AUDIT_RETENTION_FISCAL_DAYS,
        defaults.audit.retentionFiscalDays,
      ),
      retentionTechDays: num(env.AUDIT_RETENTION_TECH_DAYS, defaults.audit.retentionTechDays),
    },

    http: { ...defaults.http },

    // Override env per il device token (solo dev)
    _rawDeviceTokenEnv: env.DEVICE_TOKEN || null,
  };
}

/**
 * Applica override salvati nella tabella `config` del DB.
 * Mutazione in-place del config.
 */
function mergeDbOverrides(config, configRepo) {
  const overrides = configRepo.all();
  for (const { key, value } of overrides) {
    applyPath(config, key, value);
  }
}

function applyPath(target, dotted, value) {
  const parts = dotted.split('.');
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!node[p] || typeof node[p] !== 'object') node[p] = {};
    node = node[p];
  }
  const last = parts[parts.length - 1];
  try {
    node[last] = JSON.parse(value);
  } catch {
    node[last] = value;
  }
}

/**
 * Chiavi config che possono essere modificate da remoto (es. via WS `config.update`
 * o REST). Tutto ciò che non è qui dentro va rifiutato lato server perché
 * cambiarlo da remoto compromette la sicurezza del servizio (bind addr, URL
 * Strapi, cert pinning, driver swap, ...). Vedi C-2 nel security review.
 */
const REMOTE_MODIFIABLE_KEYS = new Set([
  'logLevel',
  'scheduler.pollWsConnectedS',
  'scheduler.pollWsDisconnectedS',
  'scheduler.heartbeatS',
  'scheduler.wsReconnectCheckS',
  'scheduler.cleanupCron',
  'scheduler.verifyAuditCron',
  'queue.maxAttempts',
  'queue.maxSize',
  'audit.retentionFiscalDays',
  'audit.retentionTechDays',
  'drivers.stub.latencyMs',
  'drivers.stub.failureRate',
]);

function isRemoteModifiable(key) {
  return REMOTE_MODIFIABLE_KEYS.has(String(key));
}

module.exports = { loadConfig, mergeDbOverrides, REMOTE_MODIFIABLE_KEYS, isRemoteModifiable };
