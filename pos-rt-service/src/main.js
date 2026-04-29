#!/usr/bin/env node
'use strict';

const { Application } = require('./app');
const { getLogger } = require('./utils/logger');

const log = getLogger('main');

async function main() {
  const app = new Application();

  // Graceful shutdown
  const shutdown = async (signal) => {
    log.info({ signal }, 'Segnale ricevuto');
    try {
      await app.stop();
    } catch (err) {
      log.error({ err }, 'Errore durante shutdown');
      process.exit(1);
    }
    process.exit(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  process.on('uncaughtException', (err) => {
    log.fatal({ err }, 'uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    log.fatal({ reason }, 'unhandledRejection');
  });

  try {
    await app.start();
    // stampa info apertura UI
    const url = app.apiAddress;
    log.info(`► API locale: ${url}`);
    log.info(`► UI setup:   ${url}/ui/pair.html`);
    log.info(`► Dashboard:  ${url}/ui/dashboard.html`);
  } catch (err) {
    log.fatal({ err }, 'Startup fallito');
    process.exit(1);
  }
}

main();
