'use strict';

const { getDb } = require('../db');

function get(entity) {
  return getDb().prepare('SELECT * FROM sync_state WHERE entity = ?').get(entity) || null;
}

function updateCursor(entity, cursor) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO sync_state (entity, last_cursor, last_pulled_at)
       VALUES (?, ?, ?)
       ON CONFLICT(entity) DO UPDATE SET last_cursor = excluded.last_cursor, last_pulled_at = excluded.last_pulled_at`,
    )
    .run(entity, cursor, now);
}

function touchPull(entity) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO sync_state (entity, last_pulled_at)
       VALUES (?, ?)
       ON CONFLICT(entity) DO UPDATE SET last_pulled_at = excluded.last_pulled_at`,
    )
    .run(entity, now);
}

module.exports = { get, updateCursor, touchPull };
