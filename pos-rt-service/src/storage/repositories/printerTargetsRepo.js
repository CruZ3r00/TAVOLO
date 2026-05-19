'use strict';

const { getDb } = require('../db');

/**
 * Repository per printer_targets — configurazioni stampanti di stazione e
 * dispositivi cassa sincronizzati da Strapi.
 *
 * Pattern analogo a configRepo/deviceRepo: prepared statements, transactional
 * dove necessario.
 */

/**
 * Lista tutte le printer_targets.
 * @returns {Array<{id,role,key,driver,host,port,options_json,capabilities_json,enabled,updated_at}>}
 */
function list() {
  return getDb().prepare('SELECT * FROM printer_targets ORDER BY role, key').all();
}

/**
 * Lista targets filtrati per ruolo e stato enabled.
 * @param {string} role - 'station' | 'cash'
 * @returns {Array}
 */
function listByRole(role) {
  return getDb()
    .prepare('SELECT * FROM printer_targets WHERE role = ? AND enabled = 1 ORDER BY key')
    .all(role);
}

/**
 * Restituisce un singolo target per (role, key).
 * @param {string} role
 * @param {string} key
 * @returns {Object|undefined}
 */
function getByRoleKey(role, key) {
  return getDb()
    .prepare('SELECT * FROM printer_targets WHERE role = ? AND key = ?')
    .get(role, key);
}

/**
 * Upsert transazionale di un array di rows. Ogni row deve avere almeno
 * {role, key, driver}. Campi opzionali: host, port, options_json, capabilities_json, enabled.
 * @param {Array<{role,key,driver,host?,port?,options_json?,capabilities_json?,enabled?}>} rows
 */
function upsertMany(rows) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO printer_targets (role, key, driver, host, port, options_json, capabilities_json, enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(role, key) DO UPDATE SET
      driver = excluded.driver,
      host = excluded.host,
      port = excluded.port,
      options_json = excluded.options_json,
      capabilities_json = excluded.capabilities_json,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `);

  const now = Date.now();
  const tx = db.transaction(() => {
    for (const row of rows) {
      const optionsJson =
        row.options_json != null
          ? typeof row.options_json === 'string'
            ? row.options_json
            : JSON.stringify(row.options_json)
          : null;
      const capabilitiesJson =
        row.capabilities_json != null
          ? typeof row.capabilities_json === 'string'
            ? row.capabilities_json
            : JSON.stringify(row.capabilities_json)
          : null;
      stmt.run(
        row.role,
        row.key,
        row.driver,
        row.host || null,
        row.port != null ? Number(row.port) : null,
        optionsJson,
        capabilitiesJson,
        row.enabled != null ? (row.enabled ? 1 : 0) : 1,
        now,
      );
    }
  });
  tx();
}

/**
 * Rimuove le righe non piu presenti nel server config.
 * @param {Array<{role:string, key:string}>} keepPairs - coppie da mantenere
 * @returns {number} numero di righe rimosse
 */
function removeMissing(keepPairs) {
  const db = getDb();
  if (!keepPairs || keepPairs.length === 0) {
    // rimuovi tutto
    const info = db.prepare('DELETE FROM printer_targets').run();
    return info.changes;
  }

  // Costruisci i placeholder per le coppie da mantenere.
  // Usa una query con sottoselect per evitare SQL injection:
  // DELETE WHERE (role||'|'||key) NOT IN (?, ?, ...)
  const pairKeys = keepPairs.map((p) => `${p.role}|${p.key}`);
  const placeholders = pairKeys.map(() => '?').join(',');
  const info = db
    .prepare(`DELETE FROM printer_targets WHERE (role || '|' || key) NOT IN (${placeholders})`)
    .run(...pairKeys);
  return info.changes;
}

/**
 * Svuota la tabella. Utile in test.
 * @returns {number} righe rimosse
 */
function clear() {
  const info = getDb().prepare('DELETE FROM printer_targets').run();
  return info.changes;
}

module.exports = { list, listByRole, getByRoleKey, upsertMany, removeMissing, clear };
