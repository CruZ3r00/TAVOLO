'use strict';

const cron = require('node-cron');
const { getLogger } = require('../utils/logger');
const jobQueueRepo = require('../storage/repositories/jobQueueRepo');
const auditRepo = require('../storage/repositories/auditRepo');
const { AppError, CODES } = require('../utils/errors');

const log = getLogger('services/scheduler');

/**
 * Scheduler di job periodici.
 *
 *   - pullJobs: pull HTTP con intervallo variabile (veloce se WS down)
 *   - retryDispatch: invoca queue.dispatch() per i retry scadenzati
 *   - heartbeat: POST heartbeat a Strapi
 *   - reconnectWs: forza reconnect se ws è disconnesso
 *   - cleanup: pulisce job vecchi (cron notturno)
 *   - verifyAudit: verifica chain integrity (cron notturno)
 *
 * Ogni job è single-flight (lock booleano) per evitare sovrapposizioni.
 */
class Scheduler {
  constructor({ queueManager, syncService, wsClient, config, driverRegistry }) {
    this.queue = queueManager;
    this.sync = syncService;
    this.ws = wsClient;
    this.config = config;
    this.driverRegistry = driverRegistry;

    this._timers = [];
    this._cronTasks = [];
    this._locks = {};
  }

  start() {
    const sched = this.config.scheduler;

    // Poll job da Strapi: frequenza adattiva
    this._timers.push(this._interval('pullJobs', () => this._pullJobsAdaptive(), 1000));

    // Dispatch retry: ogni 60s
    this._timers.push(this._interval('retryDispatch', () => this.queue.dispatch(), 60_000));

    // Heartbeat
    this._timers.push(this._interval('heartbeat', () => this._sendHeartbeat(), sched.heartbeatS * 1000));

    // Reconnect WS se down
    this._timers.push(
      this._interval('reconnectWs', () => this._reconnectWsIfNeeded(), sched.wsReconnectCheckS * 1000),
    );

    // Release stuck in_progress jobs (processo crashato)
    this._timers.push(this._interval('releaseStuck', () => this._releaseStuck(), 5 * 60_000));

    // Cleanup notturno
    if (cron.validate(sched.cleanupCron)) {
      this._cronTasks.push(
        cron.schedule(sched.cleanupCron, () => this._runSafe('cleanup', () => this._cleanup())),
      );
    }

    // Verify audit chain notturno
    if (cron.validate(sched.verifyAuditCron)) {
      this._cronTasks.push(
        cron.schedule(sched.verifyAuditCron, () =>
          this._runSafe('verifyAudit', () => this._verifyAudit()),
        ),
      );
    }

    log.info('Scheduler avviato');
  }

  stop() {
    for (const t of this._timers) clearInterval(t);
    this._timers = [];
    for (const t of this._cronTasks) {
      try {
        t.stop();
      } catch (_) {}
    }
    this._cronTasks = [];
  }

  _interval(name, fn, initialMs) {
    return setInterval(() => this._runSafe(name, fn), initialMs);
  }

  async _runSafe(name, fn) {
    if (this._locks[name]) {
      log.debug({ job: name }, 'Single-flight: skip');
      return;
    }
    this._locks[name] = true;
    const t0 = Date.now();
    try {
      await fn();
    } catch (err) {
      log.warn({ job: name, err: err.message }, 'Scheduler job errore');
    } finally {
      this._locks[name] = false;
      const dt = Date.now() - t0;
      if (dt > 5000) log.info({ job: name, dt }, 'Scheduler job lento');
    }
  }

  _pullAllowedAt() {
    if (!this._pullState) this._pullState = { lastRun: 0 };
    return this._pullState;
  }

  async _pullJobsAdaptive() {
    const st = this._pullAllowedAt();
    const connected = this.ws && this.ws.isConnected();
    const intervalS = connected
      ? this.config.scheduler.pollWsConnectedS
      : this.config.scheduler.pollWsDisconnectedS;
    const now = Date.now();
    if (now - st.lastRun < intervalS * 1000) return;
    st.lastRun = now;

    try {
      const added = await this.sync.pullJobs();
      if (added > 0) {
        // dispatch subito i nuovi job
        await this.queue.dispatch();
      }
    } catch (err) {
      if (err instanceof AppError && err.code === CODES.DEVICE_REVOKED) {
        log.error('Device revocato server-side: stop scheduler');
        this.stop();
      }
    }
  }

  async _sendHeartbeat() {
    const queueStats = this.queue.stats();
    const drivers = this.driverRegistry?.status?.() || {};
    await this.sync.heartbeat({
      version: '1.0.0',
      uptime: process.uptime(),
      queue: queueStats,
      ws_connected: this.ws?.isConnected() || false,
      drivers,
    });
  }

  async _reconnectWsIfNeeded() {
    if (!this.ws) return;
    if (this.ws.isConnected()) return;
    if (this.ws.state === 'backoff' || this.ws.state === 'connecting') return;
    this.ws.triggerReconnectNow();
  }

  async _releaseStuck() {
    const released = jobQueueRepo.releaseStuck();
    if (released > 0) log.warn({ released }, 'Job stuck rilasciati (probabile crash)');
  }

  async _cleanup() {
    const removed = jobQueueRepo.cleanupOlderThan(30);
    log.info({ removed }, 'Cleanup job vecchi');
    auditRepo.append({
      kind: 'maintenance.cleanup',
      payload: { removed_jobs: removed },
    });
  }

  async _verifyAudit() {
    const r = auditRepo.verifyChain();
    if (!r.valid) {
      log.error({ r }, 'Audit chain CORROTTA');
      auditRepo.append({
        kind: 'audit.integrity_violation',
        payload: { mismatch_at: r.mismatch_at, reason: r.reason },
      });
    } else {
      log.info({ checked: r.checked }, 'Audit chain OK');
    }
  }
}

module.exports = { Scheduler };
