'use strict';

const PQueue = require('p-queue').default;
const { getLogger } = require('../utils/logger');
const { AppError, CODES } = require('../utils/errors');
const { queueRetryDelayMs } = require('../utils/backoff');
const jobQueueRepo = require('../storage/repositories/jobQueueRepo');
const auditRepo = require('../storage/repositories/auditRepo');

const log = getLogger('services/queueManager');

/**
 * QueueManager — orchestra il dispatch dei job dalla coda persistente ai moduli
 * business (che parlano con i driver).
 *
 *   - Idempotency: event_id è UNIQUE nel DB, enqueue duplicati vengono scartati.
 *   - Retry: exp backoff (QUEUE_RETRY_SCHEDULE_MS). Dopo maxAttempts → DLQ.
 *   - Concurrency: p-queue (default 1, driver hardware seriali non amano parallelo).
 *   - Single-flight: un'istanza di dispatch alla volta (lock booleano).
 */
class QueueManager {
  constructor({ handlers, maxAttempts = 6, concurrency = 1, batchSize = 10, syncService }) {
    this.handlers = handlers; // { [kind]: async (payload, ctx) => outcome }
    this.maxAttempts = maxAttempts;
    this.batchSize = batchSize;
    this.syncService = syncService;
    this.pqueue = new PQueue({ concurrency });
    this._dispatchRunning = false;
  }

  /**
   * Enqueue idempotente. Ritorna true se nuovo, false se duplicato.
   */
  enqueue({ event_id, kind, payload, priority }) {
    if (!this.handlers[kind]) {
      log.warn({ kind, event_id }, 'Nessun handler registrato per questo kind');
    }
    const row = jobQueueRepo.enqueue({ event_id, kind, payload, priority });
    if (!row) {
      log.debug({ event_id }, 'Job duplicato, scartato');
      return false;
    }
    return true;
  }

  stats() {
    return jobQueueRepo.stats();
  }

  /**
   * Dispatch: preleva batch di job pronti ed esegue in parallelo (fino a concurrency).
   * Single-flight: se già in esecuzione, no-op.
   */
  async dispatch() {
    if (this._dispatchRunning) {
      log.debug('Dispatch già in corso, skip');
      return;
    }
    this._dispatchRunning = true;
    try {
      const batch = jobQueueRepo.pickForDispatch(this.batchSize);
      if (batch.length === 0) return;

      log.debug({ count: batch.length }, 'Dispatch batch');
      const tasks = batch.map((job) => this.pqueue.add(() => this._runJob(job)));
      await Promise.allSettled(tasks);
    } finally {
      this._dispatchRunning = false;
    }
  }

  async _runJob(row) {
    const claimed = jobQueueRepo.claim(row.id);
    if (!claimed) {
      log.debug({ id: row.id }, 'Job già claimato da altro worker, skip');
      return;
    }

    const job = claimed;
    const payload = safeParse(job.payload_json);
    const handler = this.handlers[job.kind];

    log.info({ id: job.id, kind: job.kind, attempt: job.attempts, event_id: job.event_id }, 'Esecuzione job');

    auditRepo.append({
      kind: 'job.started',
      eventId: job.event_id,
      payload: { kind: job.kind, attempt: job.attempts },
    });

    if (!handler) {
      const msg = `Nessun handler per kind="${job.kind}"`;
      this._handleFailure(job, new AppError(CODES.NOT_IMPLEMENTED, msg));
      return;
    }

    try {
      const outcome = await handler(payload, { job });
      jobQueueRepo.markDone(job.id);
      auditRepo.append({
        kind: 'job.done',
        eventId: job.event_id,
        payload: { kind: job.kind },
        meta: outcome && typeof outcome === 'object' ? sanitizeOutcome(outcome) : {},
      });
      log.info({ id: job.id, event_id: job.event_id }, 'Job completato');
      if (this.syncService) {
        // ack async, non bloccante rispetto al dispatch
        this.syncService
          .ackJob(job.event_id, 'success', outcome || {})
          .catch((err) => log.warn({ err: err.message }, 'Ack success fallito'));
      }
    } catch (err) {
      this._handleFailure(job, err);
    }
  }

  _handleFailure(job, err) {
    const message = err instanceof AppError ? `${err.code}: ${err.message}` : err.message;
    auditRepo.append({
      kind: 'job.failed',
      eventId: job.event_id,
      payload: { kind: job.kind, attempt: job.attempts },
      meta: { error: message },
    });

    if (job.attempts >= this.maxAttempts) {
      jobQueueRepo.markDeadLetter(job.id, message);
      log.error({ id: job.id, attempts: job.attempts, err: message }, 'Job → DLQ');
      auditRepo.append({
        kind: 'job.dlq',
        eventId: job.event_id,
        payload: { kind: job.kind },
        meta: { reason: message },
      });
      if (this.syncService) {
        this.syncService
          .ackJob(job.event_id, 'failure', {
            error_code: err.code || 'UNKNOWN',
            error_message: err.message,
          })
          .catch((e) => log.warn({ err: e.message }, 'Ack failure fallito'));
      }
      return;
    }

    const delayMs = queueRetryDelayMs(job.attempts);
    const nextAt = new Date(Date.now() + delayMs).toISOString();
    jobQueueRepo.markFailed(job.id, message, nextAt);
    log.warn({ id: job.id, attempt: job.attempts, delayMs, err: message }, 'Job riprogrammato');
  }
}

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function sanitizeOutcome(obj) {
  // niente PII nei meta dell'audit; filtra chiavi sensibili
  const blacklist = ['customer_name', 'phone', 'email', 'password', 'address'];
  const out = {};
  for (const k of Object.keys(obj)) {
    if (blacklist.includes(k)) continue;
    const v = obj[k];
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') continue;
    out[k] = v;
  }
  return out;
}

module.exports = { QueueManager };
