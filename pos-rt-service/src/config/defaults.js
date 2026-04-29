'use strict';

module.exports = {
  logLevel: 'info',

  api: {
    host: '127.0.0.1',
    port: 0,
    rateLimit: { windowMs: 60_000, max: 30 },
    allowRePair: false,
  },

  strapi: {
    url: null,
    wsUrl: null,
    allowInsecure: false,
    trustedCertFingerprints: [],
    requestTimeoutMs: 15_000,
  },

  scheduler: {
    pollWsConnectedS: 60,
    pollWsDisconnectedS: 10,
    heartbeatS: 30,
    wsReconnectCheckS: 5,
    cleanupCron: '0 4 * * *',
    verifyAuditCron: '0 3 * * *',
  },

  drivers: {
    // Selezione driver attivi (sovrascrivibile via env PRINTER_DRIVER / PAYMENT_DRIVER
    // o via configRepo runtime — vedi config.update WS).
    //
    // Disponibili (RT/printer): stub, epson-fpmate, custom-xon, escpos-fiscal
    // Disponibili (POS/payment): stub, generic-ecr, jpos, escpos-bt
    printer: 'stub',
    payment: 'stub',

    stub: {
      latencyMs: 200,
      failureRate: 0,
    },

    // Cassa fiscale (RT) — configurazioni di esempio. Imposta `host` reale
    // dalla dashboard o via config DB.
    'epson-fpmate': {
      host: null,
      port: 80,
      https: false,
      username: null,
      password: null,
      timeoutMs: 30_000,
      operator: '1',
      vatGroup: '1',
    },
    'custom-xon': {
      host: null,
      port: 9100,
      timeoutMs: 30_000,
      operator: '1',
    },
    'escpos-fiscal': {
      host: null,
      port: 9100,
      timeoutMs: 30_000,
      operator: '1',
    },

    // Terminale POS — niente SDK proprietari.
    'generic-ecr': {
      host: null,
      port: 6000,
      workstationId: 'POS01',
      popId: '1',
      applicationSender: 'pos-rt-service',
      currency: 978,
      timeoutMs: 30_000,
    },
    jpos: {
      host: null,
      port: 9000,
      terminalId: 'POS00001',
      currency: '978',
      timeoutMs: 30_000,
    },
    'escpos-bt': {
      path: null, // 'COM4' su Windows, '/dev/rfcomm0' su Linux, '/dev/cu.Bluetooth-XXX' su macOS
      baudRate: 9600,
      timeoutMs: 30_000,
    },
  },

  queue: {
    maxAttempts: 6,
    maxSize: 10_000,
    dispatchBatch: 10,
    concurrency: 1,
  },

  audit: {
    retentionFiscalDays: 3650,
    retentionTechDays: 365,
  },

  http: {
    userAgent: 'pos-rt-service/1.0',
  },
};
