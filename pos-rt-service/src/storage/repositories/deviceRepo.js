'use strict';

const { getDb } = require('../db');

function get() {
  return getDb().prepare('SELECT * FROM device WHERE id = 1').get() || null;
}

function save({ strapi_url, ws_url, name, fingerprint }) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO device (id, strapi_url, ws_url, name, fingerprint, registered_at)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         strapi_url=excluded.strapi_url,
         ws_url=excluded.ws_url,
         name=excluded.name,
         fingerprint=excluded.fingerprint`,
    )
    .run(strapi_url, ws_url, name, fingerprint, now);
  return get();
}

function touchLastSync() {
  const now = new Date().toISOString();
  getDb().prepare('UPDATE device SET last_sync_at = ? WHERE id = 1').run(now);
}

function clear() {
  getDb().prepare('DELETE FROM device').run();
}

function isPaired() {
  return !!get();
}

module.exports = { get, save, touchLastSync, clear, isPaired };
