'use strict';

const { getDb } = require('../db');
const { sha256Hex, canonicalJSON } = require('../../utils/crypto');
const { AppError, CODES } = require('../../utils/errors');

const ZERO_HASH = '0'.repeat(64);

function getLastChainHash() {
  const row = getDb()
    .prepare('SELECT chain_hash FROM audit_log ORDER BY id DESC LIMIT 1')
    .get();
  return row ? row.chain_hash : ZERO_HASH;
}

/**
 * Append atomico: recupera ultimo chain_hash, calcola nuovo, insert.
 * In transazione per evitare race.
 */
function append({ kind, eventId = null, payload = {}, meta = {} }) {
  const db = getDb();
  const ts = new Date().toISOString();
  const payload_hash = sha256Hex(canonicalJSON(payload));
  const meta_json = Object.keys(meta).length ? JSON.stringify(meta) : null;

  const txn = db.transaction(() => {
    const prev_hash = getLastChainHash();
    const chain_input = `${ts}|${kind}|${eventId || ''}|${payload_hash}|${prev_hash}`;
    const chain_hash = sha256Hex(chain_input);
    const info = db
      .prepare(
        `INSERT INTO audit_log (ts, kind, event_id, payload_hash, prev_hash, chain_hash, meta_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(ts, kind, eventId, payload_hash, prev_hash, chain_hash, meta_json);
    return {
      id: info.lastInsertRowid,
      ts,
      kind,
      event_id: eventId,
      chain_hash,
    };
  });
  return txn();
}

function verifyChain({ from = 1, limit = null } = {}) {
  const db = getDb();
  const rows = limit
    ? db
        .prepare(
          'SELECT id, ts, kind, event_id, payload_hash, prev_hash, chain_hash FROM audit_log WHERE id >= ? ORDER BY id ASC LIMIT ?',
        )
        .all(from, limit)
    : db
        .prepare(
          'SELECT id, ts, kind, event_id, payload_hash, prev_hash, chain_hash FROM audit_log WHERE id >= ? ORDER BY id ASC',
        )
        .all(from);

  let prev;
  if (from === 1) {
    prev = ZERO_HASH;
  } else {
    const prevRow = db
      .prepare('SELECT chain_hash FROM audit_log WHERE id = ?')
      .get(from - 1);
    if (!prevRow) {
      return { valid: false, mismatch_at: from, reason: 'previous_hash_missing' };
    }
    prev = prevRow.chain_hash;
  }

  for (const r of rows) {
    if (r.prev_hash !== prev) {
      return { valid: false, mismatch_at: r.id, reason: 'prev_hash_mismatch' };
    }
    const expected = sha256Hex(
      `${r.ts}|${r.kind}|${r.event_id || ''}|${r.payload_hash}|${r.prev_hash}`,
    );
    if (expected !== r.chain_hash) {
      return { valid: false, mismatch_at: r.id, reason: 'chain_hash_mismatch' };
    }
    prev = r.chain_hash;
  }

  return { valid: true, last_hash: prev, checked: rows.length };
}

function list({ from, to, kind, limit = 100, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (from) {
    where.push('ts >= ?');
    params.push(from);
  }
  if (to) {
    where.push('ts <= ?');
    params.push(to);
  }
  if (kind) {
    where.push('kind = ?');
    params.push(kind);
  }
  const sql =
    'SELECT id, ts, kind, event_id, payload_hash, chain_hash, meta_json FROM audit_log' +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return getDb().prepare(sql).all(...params);
}

function getLastOfKind(kind) {
  return (
    getDb()
      .prepare(
        'SELECT * FROM audit_log WHERE kind = ? ORDER BY id DESC LIMIT 1',
      )
      .get(kind) || null
  );
}

function count() {
  return getDb().prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
}

/**
 * Verifica completa (da usare nel cron notturno).
 * Lancia AppError se chain invalida.
 */
function assertChainValid() {
  const r = verifyChain();
  if (!r.valid) {
    throw new AppError(CODES.AUDIT_CORRUPT, `Audit chain corrotta: ${r.reason} at id=${r.mismatch_at}`);
  }
  return r;
}

module.exports = {
  append,
  verifyChain,
  assertChainValid,
  list,
  getLastOfKind,
  count,
};
