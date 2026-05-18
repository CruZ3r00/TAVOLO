'use strict';

const { getLogger } = require('../utils/logger');
const jobQueueRepo = require('../storage/repositories/jobQueueRepo');
const syncStateRepo = require('../storage/repositories/syncStateRepo');
const deviceRepo = require('../storage/repositories/deviceRepo');
const auditRepo = require('../storage/repositories/auditRepo');

const log = getLogger('services/syncService');

const ENTITY = 'jobs';

/**
 * Orchestra il pull dei job da Strapi e l'ack dei risultati.
 */
class SyncService {
  constructor({ httpClient }) {
    this.http = httpClient;
  }

  /**
   * Pulla i job pending da Strapi e li inserisce in coda.
   * Ritorna il numero di job nuovi aggiunti.
   */
  async pullJobs({ limit = 50 } = {}) {
    if (!deviceRepo.isPaired()) {
      log.debug('Non paired, skip pull');
      return 0;
    }
    const state = syncStateRepo.get(ENTITY);
    const params = { limit };
    if (state?.last_cursor) params.since = state.last_cursor;

    let res;
    try {
      res = await this.http.get('/api/pos-devices/me/jobs', { params });
    } catch (err) {
      log.warn({ err: err.message }, 'Pull job fallito');
      throw err;
    }

    const items = res?.data || [];
    const nextCursor = res?.meta?.next_cursor || state?.last_cursor || null;
    let added = 0;

    for (const item of items) {
      const inserted = jobQueueRepo.enqueue({
        event_id: item.event_id || item.id,
        kind: item.kind,
        payload: item.payload,
        priority: item.priority || 100,
      });
      if (inserted) {
        added++;
        auditRepo.append({
          kind: 'job.received',
          eventId: inserted.event_id,
          payload: { kind: inserted.kind },
          meta: { source: 'pull' },
        });
      }
    }

    if (nextCursor) syncStateRepo.updateCursor(ENTITY, nextCursor);
    else syncStateRepo.touchPull(ENTITY);

    if (added > 0) {
      log.info({ added, received: items.length }, 'Nuovi job in coda');
    } else {
      log.debug({ received: items.length }, 'Pull completato');
    }
    deviceRepo.touchLastSync();
    return added;
  }

  /**
   * Ack di un job verso Strapi. Robusto ai retry: se Strapi rigetta con errore
   * non-retriable, logghiamo ma non rilanciamo (il job resta in stato finale localmente).
   */
  async ackJob(eventId, result, outcome = {}) {
    try {
      const res = await this.http.post(`/api/pos-devices/me/jobs/${encodeURIComponent(eventId)}/ack`, {
        result,
        outcome,
      });
      log.debug({ eventId, result }, 'Ack inviato');
      auditRepo.append({
        kind: 'job.acked',
        eventId,
        payload: { result, outcome },
      });
      return res;
    } catch (err) {
      log.warn({ eventId, err: err.message }, 'Ack fallito (sarà ritentato)');
      throw err;
    }
  }

  /**
   * Pull printer config da Strapi e applica a DB locale + driverRegistry.
   * Errori loggati ma non bloccanti (la connettivita verso cloud e' inaffidabile by design).
   * @param {{ printerTargetsRepo?: Object, configRepo?: Object, driverRegistry?: Object }} deps
   */
  async pullConfig({ printerTargetsRepo, configRepo, driverRegistry } = {}) {
    if (!deviceRepo.isPaired()) {
      log.debug('Non paired, skip pullConfig');
      return;
    }
    try {
      const res = await this.http.get('/api/pos-devices/me/config');
      if (!res) return;

      // Printer targets
      if (printerTargetsRepo && Array.isArray(res.printer_targets)) {
        const rows = res.printer_targets.map((t) => ({
          role: t.role,
          key: t.key,
          driver: t.driver,
          host: t.host,
          port: t.port,
          options_json: t.options ? JSON.stringify(t.options) : null,
          capabilities_json: t.capabilities ? JSON.stringify(t.capabilities) : null,
          enabled: t.enabled !== false,
        }));
        printerTargetsRepo.upsertMany(rows);
        printerTargetsRepo.removeMissing(rows.map((r) => ({ role: r.role, key: r.key })));

        if (driverRegistry) {
          await driverRegistry.reload(printerTargetsRepo.list());
        }
        log.info({ count: rows.length }, 'pullConfig: printer_targets aggiornati');
      }

      // auto_print_kitchen_enabled
      if (configRepo && res.auto_print_kitchen_enabled != null) {
        configRepo.set('auto_print_kitchen_enabled', res.auto_print_kitchen_enabled);
      }

      log.debug('pullConfig completato');
    } catch (err) {
      // Non bloccante: log e via
      log.warn({ err: err.message }, 'pullConfig fallito');
    }
  }

  async heartbeat(stats = {}) {
    if (!deviceRepo.isPaired()) return;
    try {
      await this.http.post('/api/pos-devices/me/heartbeat', stats);
      log.debug('Heartbeat ok');
    } catch (err) {
      log.warn({ err: err.message }, 'Heartbeat fallito');
    }
  }
}

module.exports = { SyncService };
