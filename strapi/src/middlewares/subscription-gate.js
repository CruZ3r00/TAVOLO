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

/**
 * Path che servono il "Bar Management" (turno bar + report unita bottiglie).
 * Visibili a OWNER/GESTIONE su qualunque piano, a STAFF_BAR solo su `pro`,
 * a STAFF_CUCINA solo su `starter` (su starter non c'e' staff bar).
 */
const BAR_SHIFT_PATH_PATTERNS = [
  /^\/api\/bar-shifts$/,
  /^\/api\/bar-shifts\/current$/,
  /^\/api\/bar-shifts\/current\/report$/,
  /^\/api\/bar-shifts\/open$/,
  /^\/api\/bar-shifts\/carico-fatto$/,
  /^\/api\/bar-shifts\/history$/,
  /^\/api\/bar-shifts\/[^/]+$/,
  /^\/api\/bar-shifts\/[^/]+\/close$/,
  /^\/api\/bar-shifts\/[^/]+\/report$/,
];

function isBarShiftPath(path) {
  return BAR_SHIFT_PATH_PATTERNS.some((re) => re.test(path));
}

/**
 * Path della "Gestione magazzino avanzata" (solo OWNER su piano `pro`).
 * Le route legacy `GET /api/ingredients` + `PUT /api/ingredients/toggle`
 * restano accessibili come gia consentite (gating staff classico).
 */
const PANTRY_PRO_PATH_PATTERNS = [
  /^\/api\/ingredients\/advanced$/,
  /^\/api\/ingredients\/[^/]+\/restock$/,
  /^\/api\/ingredients\/[^/]+\/waste$/,
  /^\/api\/ingredients\/[^/]+\/confirm-depleted$/,
  /^\/api\/ingredients\/[^/]+\/movements$/,
  /^\/api\/restock-orders$/,
  /^\/api\/restock-orders\/[^/]+$/,
  /^\/api\/restock-orders\/[^/]+\/receive$/,
  /^\/api\/restock-orders\/[^/]+\/cancel$/,
  /^\/api\/inventory\/alerts$/,
  /^\/api\/inventory\/alerts\/[^/]+\/acknowledge$/,
];

/**
 * `POST/PATCH/DELETE /api/ingredients/:id` (pro advanced). Le legacy
 * `GET /api/ingredients` + `PUT /api/ingredients/toggle` sono permessi a
 * tutti i piani.
 */
function isPantryProMutationPath(method, path) {
  if (method === 'POST' && path === '/api/ingredients') return true;
  if ((method === 'PATCH' || method === 'DELETE') && /^\/api\/ingredients\/[^/]+$/.test(path)) {
    if (path === '/api/ingredients/toggle') return false; // legacy PUT, gestito altrove
    return true;
  }
  return false;
}

function isPantryProPath(method, path) {
  if (PANTRY_PRO_PATH_PATTERNS.some((re) => re.test(path))) return true;
  if (isPantryProMutationPath(method, path)) return true;
  // Element recipe (qty_per_serving): NON e' pro-only. La gestione avanzata
  // delle bevande (cocktail/calici di vino) e' un modulo bar disponibile a
  // tutti i piani: owner/gestione possono salvare e leggere la ricetta a
  // prescindere dal piano. Il magazzino vero e proprio (stock_qty, restock,
  // alert) resta pro-only.
  return false;
}

function isStaffApiAllowed(role, method, path, ownerPlan) {
  // Gestione magazzino: solo OWNER su pro. Niente GESTIONE: l'utente ha
  // richiesto (Q-BAR-5) che la dispensa avanzata sia visibile solo al titolare.
  if (isPantryProPath(method, path)) {
    return role === 'owner' && ownerPlan === 'pro';
  }

  if (role === 'owner' || role === 'gestione') return true;
  if (path === '/api/users/me') return method === 'GET';

  // Bar shift API: gating piano + ruolo
  if (isBarShiftPath(path)) {
    if (role === 'bar') return true; // bar esiste solo su pro
    if (role === 'cucina') return ownerPlan === 'starter'; // cucina vede bar solo se starter
    return false; // cameriere/pizzeria/cucina_sg: no bar-shift
  }

  if (role === 'cameriere') {
    if (path === '/api/tables') return method === 'GET' || method === 'POST';
    if (path === '/api/ingredients/addons') return method === 'GET';
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
    if (/^\/api\/orders\/[^/]+\/send$/.test(path)) return method === 'POST';
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
    let actor = null;
    if (user) {
      try {
        actor = await resolveStaffContext(strapi, user);
      } catch (err) {
        strapi.log.warn(`subscription gate staff context fallback: ${err.message}`);
        actor = {
          actor: user,
          role: 'owner',
          owner: user,
          ownerId: user.id,
          staffActive: true,
          isStaff: false,
        };
      }
    }
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

function createSubscriptionGate(_config, { strapi }) {
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

    const ownerPlan = String(billingUser && billingUser.subscription_plan || '').toLowerCase();
    if (actor && !isStaffApiAllowed(actor.role, ctx.method, path, ownerPlan)) {
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
}

module.exports = createSubscriptionGate;
module.exports.__private = { isStaffApiAllowed };
