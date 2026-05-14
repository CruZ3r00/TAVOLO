'use strict';

const crypto = require('crypto');

const CHALLENGE_PURPOSE = '2fa-login';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function hmac(strapi, value, suffix = '') {
  const secret = strapi.config.get('plugin::users-permissions.jwtSecret') || process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT secret non configurato');
  return crypto.createHmac('sha256', `${secret}:${suffix}`).update(value).digest('base64url');
}

function signTwoFactorChallenge(strapi, userId, extra = {}) {
  const payload = {
    id: userId,
    purpose: CHALLENGE_PURPOSE,
    exp: Date.now() + CHALLENGE_TTL_MS,
    ...extra,
  };
  const data = base64Url(JSON.stringify(payload));
  return `${data}.${hmac(strapi, data, CHALLENGE_PURPOSE)}`;
}

function verifyTwoFactorChallenge(strapi, token) {
  const [data, signature] = String(token || '').split('.');
  if (!data || !signature) return null;

  const expected = hmac(strapi, data, CHALLENGE_PURPOSE);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch (_err) {
    return null;
  }

  if (payload?.purpose !== CHALLENGE_PURPOSE || !payload.id) return null;
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

function normalizeRecoveryCode(code) {
  return String(code || '').trim().replace(/\s+/g, '').toLowerCase();
}

function generateEmailCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function normalizeEmailCode(code) {
  return String(code || '').trim().replace(/\s+/g, '');
}

function hashEmailCode(strapi, code) {
  const normalized = normalizeEmailCode(code);
  return crypto
    .createHash('sha256')
    .update(`${hmac(strapi, 'email-code', '2fa-email')}:${normalized}`)
    .digest('hex');
}

function verifyEmailCode(strapi, storedHash, code) {
  const normalized = normalizeEmailCode(code);
  if (!/^\d{6}$/.test(normalized) || !storedHash) return false;
  if (!/^[a-f0-9]{64}$/i.test(String(storedHash))) return false;
  return crypto.timingSafeEqual(
    Buffer.from(String(storedHash)),
    Buffer.from(hashEmailCode(strapi, normalized))
  );
}

function isHashedRecoveryCode(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ''));
}

function hashRecoveryCode(strapi, code) {
  const normalized = normalizeRecoveryCode(code);
  return crypto
    .createHash('sha256')
    .update(`${hmac(strapi, 'recovery-codes', '2fa-recovery')}:${normalized}`)
    .digest('hex');
}

function encodeRecoveryCodes(strapi, codes = []) {
  return codes.map((code) => hashRecoveryCode(strapi, code));
}

function consumeRecoveryCode(strapi, storedCodes = [], candidate) {
  const normalizedCandidate = normalizeRecoveryCode(candidate);
  if (!normalizedCandidate || !Array.isArray(storedCodes)) {
    return { ok: false, nextCodes: storedCodes || [] };
  }

  const candidateHash = hashRecoveryCode(strapi, normalizedCandidate);
  const index = storedCodes.findIndex((stored) => {
    const value = String(stored || '');
    if (isHashedRecoveryCode(value)) return value === candidateHash;
    return normalizeRecoveryCode(value) === normalizedCandidate;
  });

  if (index < 0) return { ok: false, nextCodes: storedCodes };

  const nextCodes = storedCodes
    .filter((_code, i) => i !== index)
    .map((code) => (isHashedRecoveryCode(code) ? code : hashRecoveryCode(strapi, code)));

  return { ok: true, nextCodes };
}

module.exports = {
  signTwoFactorChallenge,
  verifyTwoFactorChallenge,
  generateEmailCode,
  hashEmailCode,
  verifyEmailCode,
  normalizeRecoveryCode,
  hashRecoveryCode,
  encodeRecoveryCodes,
  consumeRecoveryCode,
};
