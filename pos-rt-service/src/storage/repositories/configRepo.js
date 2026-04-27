'use strict';

const { getDb } = require('../db');

function all() {
  return getDb().prepare('SELECT key, value FROM config').all();
}

function get(key) {
  const row = getDb().prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}

function set(key, value) {
  const v = typeof value === 'string' ? value : JSON.stringify(value);
  getDb()
    .prepare(
      `INSERT INTO config (key, value, updated_at)
       VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    )
    .run(key, v);
}

function remove(key) {
  getDb().prepare('DELETE FROM config WHERE key = ?').run(key);
}

module.exports = { all, get, set, remove };
