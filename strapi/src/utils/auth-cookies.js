'use strict';

const crypto = require('crypto');

const DEFAULT_AUTH_COOKIE_NAME = 'ct_auth';
const DEFAULT_CSRF_COOKIE_NAME = 'ct_csrf';
const DEFAULT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function envValue(name) {
  return String(process.env[name] || '').trim();
}

function envBool(name, fallback) {
  const value = envValue(name).toLowerCase();
  if (!value) return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}

function authCookieName() {
  return envValue('AUTH_COOKIE_NAME') || DEFAULT_AUTH_COOKIE_NAME;
}

function csrfCookieName() {
  return envValue('AUTH_CSRF_COOKIE_NAME') || DEFAULT_CSRF_COOKIE_NAME;
}

function authCookieMaxAgeMs() {
  const seconds = parseInt(envValue('AUTH_COOKIE_MAX_AGE_SECONDS') || `${DEFAULT_MAX_AGE_SECONDS}`, 10);
  const safeSeconds = Number.isInteger(seconds) && seconds > 0 ? seconds : DEFAULT_MAX_AGE_SECONDS;
  return safeSeconds * 1000;
}

function sameSiteValue() {
  const value = envValue('AUTH_COOKIE_SAMESITE').toLowerCase();
  if (value === 'strict' || value === 'none') return value;
  return 'lax';
}

function cookieDomain() {
  return envValue('AUTH_COOKIE_DOMAIN') || undefined;
}

function cookiePath() {
  return envValue('AUTH_COOKIE_PATH') || '/';
}

function cookieSecure() {
  return envBool('AUTH_COOKIE_SECURE', process.env.NODE_ENV === 'production');
}

function cookieOnlyResponses() {
  return envBool('AUTH_COOKIE_ONLY', process.env.NODE_ENV === 'production');
}

function baseCookieOptions() {
  return {
    secure: cookieSecure(),
    sameSite: sameSiteValue(),
    domain: cookieDomain(),
    path: cookiePath(),
    maxAge: authCookieMaxAgeMs(),
    overwrite: true,
  };
}

function setAuthCookies(ctx, jwt) {
  if (!ctx || !jwt) return null;
  const csrf = crypto.randomBytes(32).toString('base64url');
  const base = baseCookieOptions();

  ctx.cookies.set(authCookieName(), jwt, {
    ...base,
    httpOnly: true,
  });
  ctx.cookies.set(csrfCookieName(), csrf, {
    ...base,
    httpOnly: false,
  });
  ctx.set('X-CSRF-Token', csrf);
  return csrf;
}

function clearAuthCookies(ctx) {
  if (!ctx) return;
  const base = {
    secure: cookieSecure(),
    sameSite: sameSiteValue(),
    domain: cookieDomain(),
    path: cookiePath(),
    maxAge: 0,
    overwrite: true,
  };
  ctx.cookies.set(authCookieName(), null, { ...base, httpOnly: true });
  ctx.cookies.set(csrfCookieName(), null, { ...base, httpOnly: false });
}

function stripJwtFromBodyIfCookieOnly(ctx) {
  if (!cookieOnlyResponses()) return;
  if (ctx && ctx.body && Object.prototype.hasOwnProperty.call(ctx.body, 'jwt')) {
    delete ctx.body.jwt;
    ctx.body.cookie_auth = true;
  }
}

module.exports = {
  authCookieName,
  csrfCookieName,
  clearAuthCookies,
  cookieOnlyResponses,
  setAuthCookies,
  stripJwtFromBodyIfCookieOnly,
};
