'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Isola il salt in una cartella temp per i test
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posrt-test-'));
process.env.APP_DATA_DIR = tmpDir;

const keystore = require('../../src/utils/keystore');
const {
  encrypt,
  decrypt,
  encryptString,
  decryptString,
  sha256Hex,
  canonicalJSON,
  randomPin,
  randomToken,
  safeEqual,
} = require('../../src/utils/crypto');

before(async () => {
  // Forza il fallback scrypt — i test girano in CI senza OS keystore.
  await keystore.initMasterKey({ forceFallback: true });
});

test('encrypt/decrypt round-trip string', () => {
  const plaintext = 'secret device token 123!@#';
  const rec = encryptString(plaintext);
  assert.ok(rec.iv instanceof Buffer);
  assert.ok(rec.tag instanceof Buffer);
  assert.ok(rec.ciphertext instanceof Buffer);
  const decoded = decryptString(rec);
  assert.equal(decoded, plaintext);
});

test('tag tampering fallisce decryption', () => {
  const rec = encryptString('hello');
  rec.tag[0] ^= 0xff;
  assert.throws(() => decryptString(rec), /CRYPTO_FAILED|Decifratura/);
});

test('canonicalJSON è stabile su riordino chiavi', () => {
  const a = { b: 2, a: 1, c: { y: 2, x: 1 } };
  const b = { a: 1, c: { x: 1, y: 2 }, b: 2 };
  assert.equal(canonicalJSON(a), canonicalJSON(b));
});

test('sha256Hex produce 64 hex', () => {
  const h = sha256Hex('abc');
  assert.equal(h.length, 64);
  assert.match(h, /^[a-f0-9]{64}$/);
});

test('randomPin genera solo cifre della lunghezza attesa', () => {
  const p = randomPin(6);
  assert.equal(p.length, 6);
  assert.match(p, /^\d{6}$/);
});

test('randomToken lunghezza attesa in hex', () => {
  const t = randomToken(16);
  assert.equal(t.length, 32);
});

test('safeEqual constant-time', () => {
  assert.ok(safeEqual('abc', 'abc'));
  assert.ok(!safeEqual('abc', 'abd'));
  assert.ok(!safeEqual('abc', 'abcd'));
});
