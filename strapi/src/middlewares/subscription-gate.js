'use strict';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);
const { KITCHEN_LIKE_ROLES, resolveStaffContext } = require('../utils/staff-access');

const AUTH_CONTEXT_CACHE_TTL_MS = parseInt(process.env.SUBSCRIPTION_GATE_CACHE_TTL_MS || '5000', 10);
const AUTH_CONTEXT_CACHE_MAX = parseInt(process.env.SUBSCRIPTION_GATE_CACHE_MAX || '200', 10);
const authContextCache = new Map();

const BYPASS_PREFIXES = [
  '/api/auth/',
  '/api/billing/',
  '/api/menus/public/',
  '/api/reservations/public',
  '/api/takeaways/public',
];

function isBypassed(path) {
  return BYPASS_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function hasValidSubscription(user) {
  if (!user) return false;
  if (!ACTIVE_STATUSES.has(user.subscription_status)) return false;

  const periodEnd = user.subscription_current_period_end || user.end_subscription;
  if (!periodEnd) return true;

  const periodEndDate = new Date(periodEnd);
  if (Number.isNaN(periodEndDate.getTime())) return false;
  return periodEndDate.getTime() >= Date.now();
}

function isProfessionalPlan(user) {
  return String(user && user.subscription_plan || '').toLowerCase() === 'pro';
}

function isStaffApiAllowed(role, method, path) {
  if (role === 'owner' || role === 'gestione') return true;
  if (path === '/api/users/me') return method === 'GET';

  if (role === 'cameriere') {
    if (path === '/api/tables') return method === 'GET';
    if (path === '/api/reservations') return method === 'GET' || method === 'POST';
    if (path === '/api/reservations/walkin') return method === 'POST';
    if (/^\/api\/reservations\/[^/]+\/status$/.test(path)) return method === 'PATCH';
    if (/^\/api\/reservations\/[^/]+\/seat$/.test(path)) return method === 'POST';
    if (path === '/api/orders') return method === 'GET' || method === 'POST';
    if (path === '/api/takeaways') return method === 'POST';
    if (/^\/api\/takeaways\/[^/]+$/.test(path)) return method === 'PATCH';
    if (/^\/api\/takeaways\/[^/]+\/(accept|reject|send|pickup)$/.test(path)) return method === 'POST';
    if (/^\/api\/orders\/[^/]+$/.test(path)) return method === 'GET';
    if (/^\/api\/orders\/[^/]+\/total$/.test(path)) return method === 'GET';
    if (/^\/api\/orders\/[^/]+\/items$/.test(path)) return method === 'POST';
    if (/^\/api\/orders\/[^/]+\/items\/[^/]+$/.test(path)) {
      return method === 'PATCH' || method === 'DELETE';
    }
    if (/^\/api\/orders\/[^/]+\/items\/[^/]+\/status$/.test(path)) return method === 'PATCH';
    if (/^\/api\/orders\/[^/]+\/close$/.test(path)) return method === 'POST';
    return false;
  }

  if (KITCHEN_LIKE_ROLES.has(role)) {
    if (path === '/api/tables') return method === 'GET';
    if (path === '/api/orders') return method === 'GET';
    if (/^\/api\/orders\/[^/]+$/.test(path)) return method === 'GET';
    if (/^\/api\/orders\/[^/]+\/items\/[^/]+\/status$/.test(path)) return method === 'PATCH';
    return false;
  }

  return false;
}

async function userFromBearer(strapi, authorization) {
  const match = String(authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  try {
    const payload = await strapi.plugin('users-permissions').service('jwt').verify(match[1]);
    if (!payload?.id) return null;
    return strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: payload.id },
      populate: { fk_owner: true },
    });
  } catch (_err) {
    return null;
  }
}

function pruneAuthContextCache() {
  if (authContextCache.size <= AUTH_CONTEXT_CACHE_MAX) return;
  const now = Date.now();
  for (const [key, entry] of authContextCache.entries()) {
    if (!entry || entry.expiresAt <= now) authContextCache.delete(key);
    if (authContextCache.size <= AUTH_CONTEXT_CACHE_MAX) return;
  }
  while (authContextCache.size > AUTH_CONTEXT_CACHE_MAX) {
    const oldest = authContextCache.keys().next().value;
    authContextCache.delete(oldest);
  }
}

async function authContextFromBearer(strapi, authorization) {
  const match = String(authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!match) return { user: null, actor: null };

  const token = match[1];
  const now = Date.now();
  const cached = authContextCache.get(token);
  if (cached && cached.expiresAt > now) {
    return cached.promise || cached.value;
  }

  const promise = (async () => {
    const user = await userFromBearer(strapi, authorization);
    const actor = user ? await resolveStaffContext(strapi, user) : null;
    return { user, actor };
  })();

  authContextCache.set(token, {
    expiresAt: now + AUTH_CONTEXT_CACHE_TTL_MS,
    promise,
    value: null,
  });
  pruneAuthContextCache();

  try {
    const value = await promise;
    authContextCache.set(token, {
      expiresAt: Date.now() + AUTH_CONTEXT_CACHE_TTL_MS,
      promise: null,
      value,
    });
    return value;
  } catch (err) {
    authContextCache.delete(token);
    throw err;
  }
}

module.exports = (_config, { strapi }) => {
  return async (ctx, next) => {
    const path = ctx.path || '';

    if (!path.startsWith('/api/') || isBypassed(path)) {
      return next();
    }

    const { user, actor } = await authContextFromBearer(strapi, ctx.request.headers.authorization);
    if (!user) {
      return next();
    }

    const billingUser = actor && actor.owner ? actor.owner : user;

    if (actor && actor.isStaff && actor.staffActive === false) {
      ctx.status = 403;
      ctx.body = {
        error: {
          code: 'STAFF_DISABLED',
          message: 'Questo reparto e stato disattivato dal titolare.',
        },
      };
      return;
    }

    if (actor && !isStaffApiAllowed(actor.role, ctx.method, path)) {
      ctx.status = 403;
      ctx.body = {
        error: {
          code: 'STAFF_ROUTE_FORBIDDEN',
          message: 'Questo reparto non puo accedere a questa funzione.',
        },
      };
      return;
    }

    const activeSubscription = hasValidSubscription(billingUser);
    if (
      activeSubscription &&
      (
        actor.role === 'owner' ||
        isProfessionalPlan(billingUser) ||
        actor.role === 'cameriere' ||
        actor.role === 'cucina'
      )
    ) {
      return next();
    }

    if (activeSubscription) {
      ctx.status = 403;
      ctx.body = {
        error: {
          code: 'STAFF_PLAN_FORBIDDEN',
          message: 'Questo reparto richiede il piano Professionale.',
        },
      };
      return;
    }

    if (actor && actor.role !== 'owner') {
      ctx.status = 402;
      ctx.body = {
        error: {
          code: 'SUBSCRIPTION_REQUIRED',
          message: 'Abbonamento non attivo. Accedi con l\'account titolare per rinnovare.',
        },
      };
      return;
    }

    ctx.status = 402;
    ctx.body = {
      error: {
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Abbonamento non attivo. Completa o rinnova il pagamento per accedere.',
      },
    };
  };
};
