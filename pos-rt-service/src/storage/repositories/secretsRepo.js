'use strict';

const { getDb } = require('../db');
const { encryptString, decryptString } = require('../../utils/crypto');

function set(key, plaintext) {
  const { iv, tag, ciphertext } = encryptString(plaintext);
  getDb()
    .prepare(
      `INSERT INTO secrets (key, value_enc, iv, tag, updated_at)
       VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(key) DO UPDATE SET value_enc=excluded.value_enc, iv=excluded.iv,
         tag=excluded.tag, updated_at=excluded.updated_at`,
    )
    .run(key, ciphertext, iv, tag);
}

function get(key) {
  const row = getDb()
    .prepare('SELECT value_enc, iv, tag FROM secrets WHERE key = ?')
    .get(key);
  if (!row) return null;
  return decryptString({ ciphertext: row.value_enc, iv: row.iv, tag: row.tag });
}

function has(key) {
  const row = getDb().prepare('SELECT 1 AS x FROM secrets WHERE key = ?').get(key);
  return !!row;
}

function remove(key) {
  getDb().prepare('DELETE FROM secrets WHERE key = ?').run(key);
}

function wipe() {
  getDb().prepare('DELETE FROM secrets').run();
}

module.exports = { set, get, has, remove, wipe };
