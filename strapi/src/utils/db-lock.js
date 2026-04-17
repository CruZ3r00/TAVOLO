'use strict';

/**
 * DB lock / retry helpers.
 *
 * - `withRetry(fn, { maxAttempts })`: esegue `fn` e la ritenta in caso di
 *   deadlock o lock-timeout del DB (MySQL/Postgres/SQLite). Backoff
 *   esponenziale con jitter. Se tutti i tentativi falliscono, l'ultimo
 *   errore viene rilanciato.
 * - `getDialect(strapi)`: normalizza il client Knex in uso.
 * - `lockWebsiteConfig(trx, userId, dialect)`: SELECT ... FOR UPDATE sulla
 *   riga di capacità dell'utente target (no-op su SQLite, che serializza
 *   le write via BEGIN IMMEDIATE).
 * - `lockReservationSlot(trx, userId, slotStartISO, statuses, dialect)`:
 *   carica e blocca le prenotazioni attive dello slot.
 *
 * Vedi ADR-0001.4 per la motivazione.
 */

const RETRYABLE_ERROR_PATTERNS = /deadlock|lock wait timeout|database is locked|SQLITE_BUSY/i;

function isRetryableError(err) {
  if (!err) return false;
  const code = err.code || err.errno;
  if (code === 'ER_LOCK_DEADLOCK') return true;
  if (code === 'ER_LOCK_WAIT_TIMEOUT') return true;
  if (code === 1213 || code === 1205) return true;
  if (code === '40P01' || code === '40001') return true;
  if (code === 'SQLITE_BUSY' || code === 'SQLITE_BUSY_SNAPSHOT') return true;
  if (typeof err.message === 'string' && RETRYABLE_ERROR_PATTERNS.test(err.message)) return true;
  return false;
}

/**
 * Esegue `fn` con retry su errori di contesa DB.
 * Backoff: 50ms, 150ms, 450ms con jitter ±25%.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ maxAttempts?: number }} [opts]
 * @returns {Promise<T>}
 */
async function withRetry(fn, opts = {}) {
  const maxAttempts = Math.max(1, opts.maxAttempts || 3);
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = isRetryableError(err);
      if (!retryable || attempt === maxAttempts - 1) throw err;
      const base = 50 * Math.pow(3, attempt);
      const jitter = base * (0.75 + Math.random() * 0.5);
      await new Promise((resolve) => setTimeout(resolve, jitter));
    }
  }
  throw lastErr;
}

/**
 * Ritorna il dialect Knex ('mysql', 'postgres', 'sqlite', 'better-sqlite3').
 */
function getDialect(strapi) {
  try {
    return strapi.db.connection.client.config.client;
  } catch (_err) {
    return 'unknown';
  }
}

function isSqlite(dialect) {
  return dialect === 'sqlite' || dialect === 'better-sqlite3' || dialect === 'sqlite3';
}

/**
 * Blocca la riga `website_configs` dell'utente target. SQLite no-op.
 *
 * Strapi v5 memorizza manyToOne via link table (`website_configs_fk_user_lnk`);
 * quindi il lookup per user richiede una JOIN, non un `fk_user_id` inesistente.
 */
async function lockWebsiteConfig(trx, userId, dialect) {
  if (isSqlite(dialect)) return;
  await trx.raw(
    `SELECT wc.id FROM website_configs wc
     INNER JOIN website_configs_fk_user_lnk lnk ON lnk.website_config_id = wc.id
     WHERE lnk.user_id = ? FOR UPDATE`,
    [userId]
  );
}

/**
 * Carica (e blocca) le prenotazioni attive dello slot per l'utente. Ritorna
 * un array di record raw (colonne DB).
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {number} userId
 * @param {string} slotStartISO
 * @param {string[]} statuses elenco status attivi (es. ['confirmed','at_restaurant'])
 * @param {string} dialect
 */
async function lockActiveReservations(trx, userId, slotStartISO, statuses, dialect) {
  const qb = trx('reservations as r')
    .innerJoin('reservations_fk_user_lnk as lnk', 'lnk.reservation_id', 'r.id')
    .where('lnk.user_id', userId)
    .andWhere('r.slot_start', slotStartISO)
    .whereIn('r.status', statuses);
  if (!isSqlite(dialect)) {
    qb.forUpdate();
  }
  return qb.select('r.id as id', 'r.number_of_people as number_of_people', 'r.status as status');
}

/**
 * Blocca la riga `orders` per id. SQLite no-op.
 */
async function lockOrder(trx, orderId, dialect) {
  if (isSqlite(dialect)) return;
  await trx.raw('SELECT id FROM orders WHERE id = ? FOR UPDATE', [orderId]);
}

/**
 * Blocca la riga `tables` per id. SQLite no-op.
 */
async function lockTable(trx, tableId, dialect) {
  if (isSqlite(dialect)) return;
  await trx.raw('SELECT id FROM tables WHERE id = ? FOR UPDATE', [tableId]);
}

module.exports = {
  withRetry,
  isRetryableError,
  getDialect,
  isSqlite,
  lockWebsiteConfig,
  lockActiveReservations,
  lockOrder,
  lockTable,
};
