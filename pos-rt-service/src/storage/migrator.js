'use strict';

const fs = require('fs');
const path = require('path');
const { getDb } = require('./db');
const { getLogger } = require('../utils/logger');

const log = getLogger('storage/migrator');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function listMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function getAppliedMigrations(db) {
  db.prepare(`CREATE TABLE IF NOT EXISTS _migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`).run();
  return new Set(db.prepare('SELECT filename FROM _migrations').all().map((r) => r.filename));
}

function runMigrations() {
  const db = getDb();
  const all = listMigrations();
  const applied = getAppliedMigrations(db);

  const pending = all.filter((m) => !applied.has(m));
  if (pending.length === 0) {
    log.debug('Nessuna migration da applicare');
    return { applied: [] };
  }

  log.info({ count: pending.length, migrations: pending }, 'Applico migrations');
  const record = db.prepare('INSERT INTO _migrations (filename) VALUES (?)');

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const apply = db.transaction(() => {
      db.exec(sql);
      record.run(file);
    });
    try {
      apply();
      log.info({ file }, 'Migration applicata');
    } catch (err) {
      log.error({ file, err }, 'Migration fallita');
      throw err;
    }
  }

  return { applied: pending };
}

module.exports = { runMigrations, listMigrations };
