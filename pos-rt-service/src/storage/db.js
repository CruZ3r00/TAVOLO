'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const { getDbPath, ensureDir } = require('../utils/machine');
const { getLogger } = require('../utils/logger');

const log = getLogger('storage/db');

let _db = null;

function openDb() {
  if (_db) return _db;
  const dbPath = getDbPath();
  ensureDir(path.dirname(dbPath));

  log.info({ dbPath }, 'Apertura database');
  const db = new Database(dbPath, {
    fileMustExist: false,
  });

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  _db = db;
  return db;
}

function getDb() {
  if (!_db) return openDb();
  return _db;
}

function closeDb() {
  if (_db) {
    try {
      _db.close();
    } catch (e) {
      log.warn({ err: e }, 'Errore chiusura DB');
    }
    _db = null;
  }
}

module.exports = { openDb, getDb, closeDb };
