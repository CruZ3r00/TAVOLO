'use strict';

const http = require('http');
const { getLogger } = require('./utils/logger');
const { AppError, CODES } = require('./utils/errors');
const { openDb, closeDb } = require('./storage/db');
const { runMigrations } = require('./storage/migrator');
const { loadConfig, mergeDbOverrides, isRemoteModifiable } = require('./config/loader');
const configRepo = require('./storage/repositories/configRepo');
const deviceRepo = require('./storage/repositories/deviceRepo');
const secretsRepo = require('./storage/repositories/secretsRepo');
const auditRepo = require('./storage/repositories/auditRepo');
const { HttpClient } = require('./services/httpClient');
const { WsClient } = require('./services/wsClient');
const { SyncService } = require('./services/syncService');
const { QueueManager } = require('./services/queueManager');
const { Scheduler } = require('./services/scheduler');
const { DriverRegistry } = require('./drivers/registry');
const { buildApp } = require('./api');
const { createOrderCloseHandler } = require('./modules/payment');
const { createPrintReceiptHandler } = require('./modules/print');
const { ensureClaimCode, getClaimCodePath } = require('./utils/claim-code');
const keystore = require('./utils/keystore');

const log = getLogger('app');

class Application {
  constructor() {
    this.db = null;
    this.config = null;
    this.httpClient = null;
    this.wsClient = null;
    this.syncService = null;
    this.queueManager = null;
    this.scheduler = null;
    this.driverRegistry = null;
    this.apiServer = null;
    this.apiAddress = null;
    this._shuttingDown = false;
  }

  async start() {
    log.info('Avvio pos-rt-service');

    // 0. Master key (deve precedere qualsiasi I/O su tabelle cifrate)
    const ksRes = await keystore.initMasterKey();
    log.info({ backend: ksRes.backend }, 'Keystore master key inizializzata');

    // 1. DB + migrations
    this.db = openDb();
    runMigrations();

    // 2. Config (env -> DB override)
    this.config = loadConfig();
    mergeDbOverrides(this.config, configRepo);

    // 3. Driver registry
    this.driverRegistry = new DriverRegistry({
      printerName: this.config.drivers.printer,
      paymentName: this.config.drivers.payment,
      config: this.config,
    });
    await this.driverRegistry.loadAll();

    // 4. Handler + QueueManager
    const handlers = {
      'order.close': createOrderCloseHandler({ driverRegistry: this.driverRegistry }),
      'print.receipt': createPrintReceiptHandler({ driverRegistry: this.driverRegistry }),
    };

    // 5. HTTP + WS clients (lazy — richiedono pairing)
    this._wireRemoteClients();

    this.queueManager = new QueueManager({
      handlers,
      maxAttempts: this.config.queue.maxAttempts,
      concurrency: this.config.queue.concurrency,
      batchSize: this.config.queue.dispatchBatch,
      syncService: this.syncService, // può essere null pre-pairing
    });

    // 6. Scheduler
    if (deviceRepo.isPaired()) {
      this._startScheduler();
    } else {
      // Dispositivo non paired: assicura che esista un claim-code valido.
      // Solo chi ha accesso al filesystem privilegiato può leggerlo
      // e usarlo nell'header `X-Pairing-Claim-Code`.
      try {
        ensureClaimCode();
        log.warn(
          { claimCodePath: getClaimCodePath() },
          'Dispositivo non paired. Recupera il claim-code dal filesystem per completare il pairing.',
        );
      } catch (err) {
        log.error({ err: err.message }, 'ensureClaimCode fallito');
      }
    }

    // 7. API locale
    await this._startApi();

    auditRepo.append({
      kind: 'service.started',
      payload: { version: '1.0.0' },
      meta: { ws: !!this.wsClient, paired: deviceRepo.isPaired() },
    });

    log.info(
      { address: this.apiAddress, paired: deviceRepo.isPaired() },
      'pos-rt-service pronto',
    );
  }

  _wireRemoteClients() {
    if (!deviceRepo.isPaired()) return;
    const device = deviceRepo.get();
    let token;
    try {
      token = secretsRepo.get('device_token');
    } catch (err) {
      log.error({ err: err.message }, 'Impossibile leggere device_token (master key?)');
      throw err;
    }
    if (!token) {
      throw new AppError(CODES.NOT_PAIRED, 'Token device mancante nonostante device registrato');
    }

    this.httpClient = new HttpClient({
      baseURL: device.strapi_url,
      deviceToken: token,
      timeoutMs: this.config.strapi.requestTimeoutMs,
      allowInsecure: this.config.strapi.allowInsecure,
      trustedCertFingerprints: this.config.strapi.trustedCertFingerprints,
      userAgent: this.config.http.userAgent,
    });

    this.wsClient = new WsClient({
      url: device.ws_url,
      deviceToken: token,
    });
    this.wsClient.on('message', (msg) => this._handleWsMessage(msg));
    this.wsClient.on('connected', () => log.info('WS connected'));
    this.wsClient.on('disconnected', (d) => log.warn({ d }, 'WS disconnected'));

    this.syncService = new SyncService({ httpClient: this.httpClient });
  }

  async _handleWsMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    log.debug({ type: msg.type }, 'WS messaggio ricevuto');
    if (msg.type === 'job.new') {
      // Se il payload è già completo, enqueue direttamente;
      // altrimenti triggeriamo un pull immediato.
      if (msg.event_id && msg.kind && msg.payload) {
        const added = this.queueManager.enqueue({
          event_id: msg.event_id,
          kind: msg.kind,
          payload: msg.payload,
          priority: msg.priority,
        });
        if (added) this.queueManager.dispatch().catch((e) => log.warn({ err: e }, 'Dispatch err'));
      } else if (this.syncService) {
        this.syncService.pullJobs().then((n) => {
          if (n > 0) this.queueManager.dispatch().catch((e) => log.warn({ err: e }, 'Dispatch err'));
        });
      }
    } else if (msg.type === 'job.cancel' && msg.event_id) {
      const { getByEventId, cancel } = require('./storage/repositories/jobQueueRepo');
      const row = getByEventId(msg.event_id);
      if (row) cancel(row.id);
    } else if (msg.type === 'config.update' && msg.config) {
      const accepted = [];
      const rejected = [];
      for (const [k, v] of Object.entries(msg.config)) {
        if (isRemoteModifiable(k)) {
          configRepo.set(k, v);
          accepted.push(k);
        } else {
          rejected.push(k);
        }
      }
      if (rejected.length) {
        log.warn({ rejected }, 'config.update: chiavi non modificabili da remoto');
        try {
          auditRepo.append({
            kind: 'config.update.rejected',
            payload: { rejected_keys: rejected },
            meta: { source: 'ws' },
          });
        } catch (_) {}
      }
      if (accepted.length) {
        log.info({ accepted }, 'Config aggiornata da server');
      }
    }
  }

  _startScheduler() {
    if (this.scheduler) return;
    // Ricablare queueManager.syncService ora che è disponibile
    this.queueManager.syncService = this.syncService;

    this.scheduler = new Scheduler({
      queueManager: this.queueManager,
      syncService: this.syncService,
      wsClient: this.wsClient,
      config: this.config,
      driverRegistry: this.driverRegistry,
    });
    this.scheduler.start();
    this.wsClient.start();
  }

  async _startApi() {
    const app = buildApp({
      config: this.config,
      wsClient: this.wsClient,
      driverRegistry: this.driverRegistry,
      queueManager: this.queueManager,
      onPaired: async () => {
        // al termine del pairing: wire-up client remoti + scheduler
        log.info('onPaired → wiring up ws/http/scheduler');
        this._wireRemoteClients();
        this._startScheduler();
      },
    });

    // Mitigazione H-5: il bind deve essere SEMPRE su loopback. Bloccare ogni
    // tentativo di override (config.update via WS o stale DB record) prima
    // di accendere il listener.
    const ALLOWED_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
    const host = this.config.api.host;
    if (!ALLOWED_HOSTS.has(host)) {
      throw new AppError(
        CODES.INVALID_PAYLOAD,
        `api.host non consentito: '${host}'. L'API deve essere sempre bindata su loopback.`,
      );
    }
    const port = this.config.api.port || 0;

    this.apiServer = http.createServer(app);

    await new Promise((resolve, reject) => {
      this.apiServer.once('error', reject);
      this.apiServer.listen(port, host, () => {
        const addr = this.apiServer.address();
        this.apiAddress = `http://${host}:${addr.port}`;
        // Persisti la porta allocata
        if (port === 0) {
          configRepo.set('api.port', String(addr.port));
        }
        resolve();
      });
    });
  }

  async stop() {
    if (this._shuttingDown) return;
    this._shuttingDown = true;
    log.info('Shutdown in corso');

    try {
      auditRepo.append({ kind: 'service.stopping', payload: {} });
    } catch (_) {}

    if (this.scheduler) {
      try {
        this.scheduler.stop();
      } catch (e) {
        log.warn({ err: e }, 'Errore stop scheduler');
      }
    }
    if (this.wsClient) {
      try {
        this.wsClient.stop();
      } catch (e) {
        log.warn({ err: e }, 'Errore stop wsClient');
      }
    }
    if (this.apiServer) {
      await new Promise((resolve) => this.apiServer.close(resolve));
    }
    if (this.driverRegistry) {
      try {
        await this.driverRegistry.disposeAll();
      } catch (e) {
        log.warn({ err: e }, 'Errore dispose drivers');
      }
    }
    closeDb();
    log.info('Shutdown completato');
  }
}

module.exports = { Application };
