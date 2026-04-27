'use strict';

const { getDb } = require('../db');

const STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  FAILED: 'failed',
  DEAD_LETTER: 'dead_letter',
};

function nowIso() {
  return new Date().toISOString();
}

/**
 * Enqueue con idempotenza: se event_id esiste già, ritorna `null` (no-op).
 * Altrimenti inserisce e ritorna il record.
 */
function enqueue({ event_id, kind, payload, priority = 100 }) {
  const payload_json = JSON.stringify(payload ?? {});
  const now = nowIso();
  const stmt = getDb().prepare(
    `INSERT INTO job_queue (event_id, kind, payload_json, status, priority, next_attempt_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(event_id) DO NOTHING`,
  );
  const info = stmt.run(event_id, kind, payload_json, STATUS.PENDING, priority, now, now, now);
  if (info.changes === 0) return null;
  return getByEventId(event_id);
}

function getByEventId(event_id) {
  return getDb().prepare('SELECT * FROM job_queue WHERE event_id = ?').get(event_id) || null;
}

function getById(id) {
  return getDb().prepare('SELECT * FROM job_queue WHERE id = ?').get(id) || null;
}

/**
 * Prende batch di job da eseguire (pending o retry scheduled).
 * NON marca in_progress (fatto dal dispatcher con UPDATE in txn).
 */
function pickForDispatch(limit = 10) {
  const now = nowIso();
  return getDb()
    .prepare(
      `SELECT * FROM job_queue
       WHERE status = ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
       ORDER BY priority ASC, created_at ASC
       LIMIT ?`,
    )
    .all(STATUS.PENDING, now, limit);
}

/**
 * Claim atomico: UPDATE ... WHERE status=pending AND id=? RETURNING.
 * SQLite 3.35+ supporta RETURNING.
 */
function claim(id) {
  const now = nowIso();
  const row = getDb()
    .prepare(
      `UPDATE job_queue
       SET status = ?, attempts = attempts + 1, last_attempt_at = ?, updated_at = ?
       WHERE id = ? AND status = ?
       RETURNING *`,
    )
    .get(STATUS.IN_PROGRESS, now, now, id, STATUS.PENDING);
  return row || null;
}

function markDone(id) {
  const now = nowIso();
  getDb()
    .prepare(
      `UPDATE job_queue SET status = ?, completed_at = ?, updated_at = ?, last_error = NULL
       WHERE id = ?`,
    )
    .run(STATUS.DONE, now, now, id);
}

function markFailed(id, errorMessage, nextAttemptAt) {
  const now = nowIso();
  getDb()
    .prepare(
      `UPDATE job_queue SET status = ?, last_error = ?, next_attempt_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(STATUS.PENDING, errorMessage, nextAttemptAt, now, id);
}

function markDeadLetter(id, reason) {
  const now = nowIso();
  getDb()
    .prepare(
      `UPDATE job_queue SET status = ?, dlq_reason = ?, updated_at = ?, completed_at = ?
       WHERE id = ?`,
    )
    .run(STATUS.DEAD_LETTER, reason, now, now, id);
}

function releaseStuck(maxInProgressMs = 10 * 60 * 1000) {
  // se un job è in_progress da oltre N minuti (crash processo), rilascialo
  const cutoff = new Date(Date.now() - maxInProgressMs).toISOString();
  const info = getDb()
    .prepare(
      `UPDATE job_queue SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE status = ? AND last_attempt_at < ?`,
    )
    .run(STATUS.PENDING, STATUS.IN_PROGRESS, cutoff);
  return info.changes;
}

function stats() {
  const rows = getDb()
    .prepare('SELECT status, COUNT(*) AS n FROM job_queue GROUP BY status')
    .all();
  const out = { pending: 0, in_progress: 0, done: 0, failed: 0, dead_letter: 0, total: 0 };
  for (const { status, n } of rows) {
    out[status] = n;
    out.total += n;
  }
  return out;
}

function count() {
  return getDb().prepare('SELECT COUNT(*) AS n FROM job_queue').get().n;
}

function cleanupOlderThan(days) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const info = getDb()
    .prepare(
      `DELETE FROM job_queue WHERE status IN ('done','dead_letter') AND completed_at < ?`,
    )
    .run(cutoff);
  return info.changes;
}

function listByStatus(status, limit = 100) {
  return getDb()
    .prepare('SELECT * FROM job_queue WHERE status = ? ORDER BY updated_at DESC LIMIT ?')
    .all(status, limit);
}

function requeue(id) {
  const now = nowIso();
  getDb()
    .prepare(
      `UPDATE job_queue
       SET status = ?, next_attempt_at = ?, updated_at = ?, attempts = 0, last_error = NULL, dlq_reason = NULL
       WHERE id = ?`,
    )
    .run(STATUS.PENDING, now, now, id);
}

function cancel(id) {
  const now = nowIso();
  getDb()
    .prepare(
      `UPDATE job_queue SET status = ?, dlq_reason = ?, completed_at = ?, updated_at = ?
       WHERE id = ? AND status NOT IN ('done','dead_letter')`,
    )
    .run(STATUS.DEAD_LETTER, 'cancelled_by_admin', now, now, id);
}

module.exports = {
  STATUS,
  enqueue,
  getByEventId,
  getById,
  pickForDispatch,
  claim,
  markDone,
  markFailed,
  markDeadLetter,
  releaseStuck,
  stats,
  count,
  cleanupOlderThan,
  listByStatus,
  requeue,
  cancel,
};
