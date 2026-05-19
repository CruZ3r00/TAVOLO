'use strict';

const crypto = require('crypto');
const { authCookieName, csrfCookieName } = require('../utils/auth-cookies');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const COOKIE_AUTH_BYPASS_PREFIXES = [
  '/api/auth/',
  '/api/account/logout',
  '/api/menus/public/',
  '/api/reservations/public',
  '/api/takeaways/public',
  '/api/pos-devices/runtime',
  '/api/pos-devices/installers',
];

function isBypassed(path) {
  return COOKIE_AUTH_BYPASS_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function csrfHeader(ctx) {
  return ctx.get('x-csrf-token') || ctx.get('x-xsrf-token');
}

module.exports = () => {
  return async (ctx, next) => {
    const path = ctx.path || '';
    if (!path.startsWith('/api/') || isBypassed(path)) {
      return next();
    }

    const headers = ctx.request.headers || {};
    if (headers.authorization) {
      return next();
    }

    const token = ctx.cookies.get(authCookieName());
    if (!token) {
      return next();
    }

    if (!SAFE_METHODS.has(String(ctx.method || '').toUpperCase())) {
      const csrfCookie = ctx.cookies.get(csrfCookieName());
      const csrf = csrfHeader(ctx);
      if (!csrfCookie || !csrf || !constantTimeEqual(csrfCookie, csrf)) {
        ctx.status = 403;
        ctx.body = {
          error: {
            code: 'CSRF_TOKEN_INVALID',
            message: 'Token CSRF mancante o non valido.',
          },
        };
        return;
      }
    }

    headers.authorization = `Bearer ${token}`;
    ctx.request.header.authorization = headers.authorization;
    ctx.state.authFromCookie = true;
    await next();
  };
};
