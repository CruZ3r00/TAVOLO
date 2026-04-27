#!/usr/bin/env node
'use strict';

const { openDb, closeDb } = require('../src/storage/db');
const { runMigrations } = require('../src/storage/migrator');
const { getLogger } = require('../src/utils/logger');

const log = getLogger('scripts/migrate');

try {
  openDb();
  const r = runMigrations();
  log.info({ applied: r.applied }, 'Migrations applicate');
  closeDb();
  process.exit(0);
} catch (err) {
  log.error({ err }, 'Migrazione fallita');
  process.exit(1);
}
