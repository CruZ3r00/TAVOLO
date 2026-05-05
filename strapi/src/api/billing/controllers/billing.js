'use strict';

const Stripe = require('stripe');
const { resolveStaffContext, staffUserPayload, STAFF_ROLES } = require('../../../utils/staff-access');

const PLAN_CONFIG = {
  starter: { name: 'Starter', priceEnv: 'STRIPE_PRICE_STARTER' },
  pro: { name: 'Pro', priceEnv: 'STRIPE_PRICE_PRO' },
};

let stripeClient = null;

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    const err = new Error('STRIPE_SECRET_KEY non configurata.');
    err.status = 503;
    throw err;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
}

function getFrontendUrl() {
  const explicit = process.env.FRONTEND_URL || process.env.STRIPE_FRONTEND_URL;
  if (explicit && explicit.trim()) return explicit.trim().replace(/\/+$/, '');

  const cors = process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || 'http://localhost:5174';
  return cors.split(',')[0].trim().replace(/\/+$/, '') || 'http://localhost:5174';
}

function getPlan(planKey) {
  const key = String(planKey || '').toLowerCase();
  const plan = PLAN_CONFIG[key];
  if (!plan) return null;
  const priceId = (process.env[plan.priceEnv] || '').trim();
  if (!priceId || priceId === 'price_...' || !priceId.startsWith('price_')) {
    const err = new Error(`${plan.priceEnv} non configurata.`);
    err.status = 503;
    throw err;
  }
  return { key, ...plan, priceId };
}

function normalizePlanKey(value) {
  const key = String(value || '').toLowerCase();
  return PLAN_CONFIG[key] ? key : null;
}

function safeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    subscription_status: user.subscription_status || null,
    subscription_plan: user.subscription_plan || null,
    subscription_current_period_end: user.subscription_current_period_end || user.end_subscription || null,
    subscription_cancel_at_period_end: !!user.subscription_cancel_at_period_end,
  };
}

function isoFromUnix(timestamp) {
  return timestamp ? new Date(timestamp * 1000).toISOString() : null;
}

function dateOnlyFromUnix(timestamp) {
  return timestamp ? new Date(timestamp * 1000).toISOString().slice(0, 10) : null;
}

async function updateUserSubscription(userId, data) {
  const numericId = Number.parseInt(userId, 10);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    strapi.log.warn(`updateUserSubscription: userId non valido (${userId})`);
    return null;
  }
  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) clean[key] = value;
  }
  return strapi.db.query('plugin::users-permissions.user').update({
    where: { id: numericId },
    data: clean,
  });
}

async function syncOwnerStaffAccounts(userId) {
  const numericId = Number.parseInt(userId, 10);
  if (!Number.isFinite(numericId) || numericId <= 0 || !strapi.db.connection) return;
  try {
    await strapi.db.connection.raw('select public.sync_owner_staff_accounts(?)', [numericId]);
  } catch (err) {
    strapi.log.warn(`syncOwnerStaffAccounts fallita per user ${numericId}: ${err.message}`);
  }
}

async function findUserByStripe({ customerId, subscriptionId }) {
  if (subscriptionId) {
    const bySubscription = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { stripe_subscription_id: subscriptionId },
    });
    if (bySubscription) return bySubscription;
  }
  if (customerId) {
    return strapi.db.query('plugin::users-permissions.user').findOne({
      where: { stripe_customer_id: customerId },
    });
  }
  return null;
}

async function subscriptionSnapshot(stripe, subscriptionOrId) {
  if (!subscriptionOrId) return {};
  const subscription = typeof subscriptionOrId === 'string'
    ? await stripe.subscriptions.retrieve(subscriptionOrId)
    : subscriptionOrId;
  const priceId = subscription.items?.data?.[0]?.price?.id || null;
  const planEntry = Object.entries(PLAN_CONFIG).find(([, plan]) => process.env[plan.priceEnv] === priceId);
  const metadataPlan = normalizePlanKey(subscription.metadata?.plan);

  return {
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    subscription_plan: metadataPlan || (planEntry ? planEntry[0] : null),
    subscription_current_period_end: isoFromUnix(subscription.current_period_end),
    subscription_cancel_at_period_end: !!subscription.cancel_at_period_end,
    end_subscription: dateOnlyFromUnix(subscription.current_period_end),
  };
}

function getRawBody(ctx) {
  const unparsed = ctx.request.body && ctx.request.body[Symbol.for('unparsedBody')];
  if (unparsed) return Buffer.isBuffer(unparsed) ? unparsed : Buffer.from(String(unparsed));
  if (ctx.request.rawBody) return Buffer.from(ctx.request.rawBody);
  return null;
}

async function requireBillingUser(ctx) {
  if (ctx.state.user?.id) return ctx.state.user;

  const header = ctx.request.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  try {
    const payload = await strapi.plugin('users-permissions').service('jwt').verify(match[1]);
    if (!payload?.id) return null;
    return strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: payload.id },
    });
  } catch (err) {
    strapi.log.warn(`Billing JWT non valido: ${err.message}`);
    return null;
  }
}

module.exports = {
  async status(ctx) {
    const user = await requireBillingUser(ctx);
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    const actor = await resolveStaffContext(strapi, user);
    const billingUser = actor && actor.owner ? actor.owner : user;
    return ctx.send({
      data: {
        ...safeUser(billingUser),
        ...staffUserPayload(actor ? actor.actor : user, billingUser),
      },
    });
  },

  async createCheckoutSession(ctx) {
    const user = await requireBillingUser(ctx);
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');
    const actor = await resolveStaffContext(strapi, user);
    if (actor && ![STAFF_ROLES.OWNER].includes(actor.role)) {
      return ctx.forbidden('Solo il titolare puo gestire la fatturazione.');
    }

    const { plan: requestedPlan } = ctx.request.body || {};
    try {
      const plan = getPlan(requestedPlan || 'pro');
      if (!plan) return ctx.badRequest('Piano non valido.');

      const stripe = getStripe();
      const frontendUrl = getFrontendUrl();
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: user.stripe_customer_id || undefined,
        customer_email: user.stripe_customer_id ? undefined : user.email,
        client_reference_id: String(user.id),
        line_items: [{ price: plan.priceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${frontendUrl}/renew-sub?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/renew-sub?checkout=cancelled`,
        subscription_data: {
          metadata: {
            user_id: String(user.id),
            plan: plan.key,
          },
        },
        metadata: {
          user_id: String(user.id),
          plan: plan.key,
        },
      });

      return ctx.send({ data: { id: session.id, url: session.url } });
    } catch (err) {
      const status = err.status || err.statusCode || 500;
      strapi.log.error(`Stripe checkout failed: ${err.message}`);
      ctx.status = status;
      return ctx.send({
        error: {
          message: err.message || 'Impossibile creare la sessione Stripe Checkout.',
        },
      });
    }
  },

  // Sync esplicito da chiamare dopo il return da Stripe Checkout (success_url
   // contiene session_id={CHECKOUT_SESSION_ID}). Recupera la session da Stripe
   // e aggiorna l'utente immediatamente, senza dipendere dal webhook (utile in
   // dev/stage dove Stripe non raggiunge localhost senza tunnel).
  async syncCheckoutSession(ctx) {
    const user = await requireBillingUser(ctx);
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');
    const actor = await resolveStaffContext(strapi, user);
    if (actor && ![STAFF_ROLES.OWNER].includes(actor.role)) {
      return ctx.forbidden('Solo il titolare puo gestire la fatturazione.');
    }

    const { session_id: sessionId } = ctx.request.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      return ctx.badRequest('session_id mancante.');
    }

    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription'],
      });

      // Sicurezza: la session deve appartenere all'utente autenticato.
      const sessionUserId = session.metadata?.user_id || session.client_reference_id;
      if (sessionUserId && Number.parseInt(sessionUserId, 10) !== user.id) {
        return ctx.forbidden('Sessione non appartiene a questo utente.');
      }

      if (session.mode !== 'subscription' || !session.subscription) {
        return ctx.badRequest('Session non valida o senza subscription.');
      }

      const snapshot = await subscriptionSnapshot(stripe, session.subscription);
      await updateUserSubscription(user.id, {
        stripe_customer_id: session.customer,
        ...snapshot,
        subscription_plan: normalizePlanKey(session.metadata?.plan) || snapshot.subscription_plan,
      });
      await syncOwnerStaffAccounts(user.id);

      const refreshed = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { id: user.id },
      });
      return ctx.send({ data: safeUser(refreshed) });
    } catch (err) {
      strapi.log.error(`Stripe sync-checkout failed: ${err.message}`);
      ctx.status = err.status || err.statusCode || 500;
      return ctx.send({
        error: { message: err.message || 'Sync della sessione Stripe fallito.' },
      });
    }
  },

  async changePlan(ctx) {
    const user = await requireBillingUser(ctx);
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');
    const actor = await resolveStaffContext(strapi, user);
    if (actor && ![STAFF_ROLES.OWNER].includes(actor.role)) {
      return ctx.forbidden('Solo il titolare puo gestire la fatturazione.');
    }

    const billingUser = actor && actor.owner ? actor.owner : user;
    if (!billingUser.stripe_subscription_id) {
      return ctx.badRequest('Nessun abbonamento attivo da modificare.');
    }

    const { plan: requestedPlan } = ctx.request.body || {};
    try {
      const plan = getPlan(requestedPlan);
      if (!plan) return ctx.badRequest('Piano non valido.');

      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(billingUser.stripe_subscription_id);

      if (subscription.status === 'canceled') {
        ctx.status = 409;
        return ctx.send({
          error: { code: 'SUBSCRIPTION_CANCELED', message: 'Abbonamento gia cancellato. Sottoscrivi un nuovo piano.' },
        });
      }

      const item = subscription.items?.data?.[0];
      if (!item) return ctx.internalServerError('Item subscription non trovato.');

      if (item.price?.id === plan.priceId) {
        ctx.status = 409;
        return ctx.send({
          error: { code: 'PLAN_UNCHANGED', message: 'Sei gia su questo piano.' },
        });
      }

      const updated = await stripe.subscriptions.update(subscription.id, {
        items: [{ id: item.id, price: plan.priceId }],
        proration_behavior: 'create_prorations',
        cancel_at_period_end: false,
        metadata: { ...(subscription.metadata || {}), plan: plan.key },
      });

      const snapshot = await subscriptionSnapshot(stripe, updated);
      await updateUserSubscription(billingUser.id, { ...snapshot, subscription_plan: plan.key });
      await syncOwnerStaffAccounts(billingUser.id);

      const refreshed = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { id: billingUser.id },
      });
      return ctx.send({ data: safeUser(refreshed) });
    } catch (err) {
      strapi.log.error(`Stripe change-plan failed: ${err.message}`);
      ctx.status = err.status || err.statusCode || 500;
      return ctx.send({
        error: { message: err.message || 'Cambio piano non riuscito.' },
      });
    }
  },

  async cancelSubscription(ctx) {
    const user = await requireBillingUser(ctx);
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');
    const actor = await resolveStaffContext(strapi, user);
    if (actor && ![STAFF_ROLES.OWNER].includes(actor.role)) {
      return ctx.forbidden('Solo il titolare puo gestire la fatturazione.');
    }

    const billingUser = actor && actor.owner ? actor.owner : user;
    if (!billingUser.stripe_subscription_id) {
      return ctx.badRequest('Nessun abbonamento attivo da annullare.');
    }

    try {
      const stripe = getStripe();
      const updated = await stripe.subscriptions.update(billingUser.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
      const snapshot = await subscriptionSnapshot(stripe, updated);
      await updateUserSubscription(billingUser.id, snapshot);
      await syncOwnerStaffAccounts(billingUser.id);

      const refreshed = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { id: billingUser.id },
      });
      return ctx.send({ data: safeUser(refreshed) });
    } catch (err) {
      strapi.log.error(`Stripe cancel failed: ${err.message}`);
      ctx.status = err.status || err.statusCode || 500;
      return ctx.send({
        error: { message: err.message || 'Annullamento non riuscito.' },
      });
    }
  },

  async reactivateSubscription(ctx) {
    const user = await requireBillingUser(ctx);
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');
    const actor = await resolveStaffContext(strapi, user);
    if (actor && ![STAFF_ROLES.OWNER].includes(actor.role)) {
      return ctx.forbidden('Solo il titolare puo gestire la fatturazione.');
    }

    const billingUser = actor && actor.owner ? actor.owner : user;
    if (!billingUser.stripe_subscription_id) {
      return ctx.badRequest('Nessun abbonamento da riattivare.');
    }

    try {
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(billingUser.stripe_subscription_id);

      if (subscription.status === 'canceled') {
        ctx.status = 409;
        return ctx.send({
          error: {
            code: 'SUBSCRIPTION_CANCELED',
            message: 'Abbonamento gia terminato. Sottoscrivi un nuovo piano.',
          },
        });
      }
      if (!subscription.cancel_at_period_end) {
        ctx.status = 409;
        return ctx.send({
          error: { code: 'NOT_CANCELING', message: 'Abbonamento gia attivo, nulla da riattivare.' },
        });
      }

      const updated = await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: false,
      });
      const snapshot = await subscriptionSnapshot(stripe, updated);
      await updateUserSubscription(billingUser.id, snapshot);
      await syncOwnerStaffAccounts(billingUser.id);

      const refreshed = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { id: billingUser.id },
      });
      return ctx.send({ data: safeUser(refreshed) });
    } catch (err) {
      strapi.log.error(`Stripe reactivate failed: ${err.message}`);
      ctx.status = err.status || err.statusCode || 500;
      return ctx.send({
        error: { message: err.message || 'Riattivazione non riuscita.' },
      });
    }
  },

  async createPortalSession(ctx) {
    const user = await requireBillingUser(ctx);
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');
    const actor = await resolveStaffContext(strapi, user);
    if (actor && ![STAFF_ROLES.OWNER].includes(actor.role)) {
      return ctx.forbidden('Solo il titolare puo gestire la fatturazione.');
    }

    if (!user.stripe_customer_id) {
      return ctx.badRequest('Nessun cliente Stripe associato a questo account.');
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${getFrontendUrl()}/renew-sub`,
    });

    return ctx.send({ data: { url: session.url } });
  },

  async webhook(ctx) {
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!endpointSecret) return ctx.internalServerError('STRIPE_WEBHOOK_SECRET non configurato.');

    const stripe = getStripe();
    const rawBody = getRawBody(ctx);
    if (!rawBody) return ctx.badRequest('Raw body webhook non disponibile.');

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, ctx.request.headers['stripe-signature'], endpointSecret);
    } catch (err) {
      strapi.log.warn(`Stripe webhook signature non valida: ${err.message}`);
      return ctx.badRequest('Webhook signature non valida.');
    }

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        if (session.mode === 'subscription') {
          const userId = session.metadata?.user_id || session.client_reference_id;
          const snapshot = await subscriptionSnapshot(stripe, session.subscription);
          await updateUserSubscription(userId, {
            stripe_customer_id: session.customer,
            ...snapshot,
            subscription_plan: normalizePlanKey(session.metadata?.plan) || snapshot.subscription_plan,
          });
          await syncOwnerStaffAccounts(userId);
        }
      }

      if (
        event.type === 'customer.subscription.updated' ||
        event.type === 'customer.subscription.deleted' ||
        event.type === 'invoice.payment_failed' ||
        event.type === 'invoice.payment_succeeded'
      ) {
        const object = event.data.object;
        const subscriptionId = object.object === 'invoice' ? object.subscription : object.id;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const user = await findUserByStripe({
            customerId: subscription.customer,
            subscriptionId: subscription.id,
          });
          await updateUserSubscription(user?.id, {
            stripe_customer_id: subscription.customer,
            ...(await subscriptionSnapshot(stripe, subscription)),
          });
          await syncOwnerStaffAccounts(user?.id);
        }
      }
    } catch (err) {
      strapi.log.error(`Stripe webhook processing failed: ${err.message}`);
      return ctx.internalServerError('Errore processamento webhook Stripe.');
    }

    return ctx.send({ received: true });
  },
};
