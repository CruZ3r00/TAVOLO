'use strict';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

const BYPASS_PREFIXES = [
  '/api/auth/',
  '/api/billing/',
  '/api/menus/public/',
  '/api/reservations/public',
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

async function userFromBearer(strapi, authorization) {
  const match = String(authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  try {
    const payload = await strapi.plugin('users-permissions').service('jwt').verify(match[1]);
    if (!payload?.id) return null;
    return strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: payload.id },
      select: [
        'id',
        'subscription_status',
        'subscription_current_period_end',
        'end_subscription',
      ],
    });
  } catch (_err) {
    return null;
  }
}

module.exports = (_config, { strapi }) => {
  return async (ctx, next) => {
    const path = ctx.path || '';

    if (!path.startsWith('/api/') || isBypassed(path)) {
      return next();
    }

    const user = await userFromBearer(strapi, ctx.request.headers.authorization);
    if (!user) {
      return next();
    }

    if (hasValidSubscription(user)) {
      return next();
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
