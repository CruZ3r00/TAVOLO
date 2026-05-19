'use strict';

const Stripe = require('stripe');
const fs = require('fs');
const path = require('path');
const {
  applyStaffActiveState,
  publicSiteSlug,
  resolveStaffContext,
  staffUserPayload,
  STAFF_ROLES,
} = require('../../../utils/staff-access');
const { clearAuthCookies } = require('../../../utils/auth-cookies');

const PLAN_CONFIG = {
  starter: { name: 'Starter', priceEnv: 'STRIPE_PRICE_STARTER' },
  pro: { name: 'Pro', priceEnv: 'STRIPE_PRICE_PRO' },
};
const MANAGED_STAFF_ROLES = [
  STAFF_ROLES.CAMERIERE,
  STAFF_ROLES.CUCINA,
  STAFF_ROLES.BAR,
  STAFF_ROLES.PIZZERIA,
  STAFF_ROLES.CUCINA_SG,
];
const STAFF_ACCESS_ROLES_BY_PLAN = {
  starter: [STAFF_ROLES.CAMERIERE, STAFF_ROLES.CUCINA],
  pro: [STAFF_ROLES.CAMERIERE, STAFF_ROLES.CUCINA, STAFF_ROLES.BAR, STAFF_ROLES.PIZZERIA, STAFF_ROLES.CUCINA_SG],
};
const STAFF_ACCESS_DESCRIPTIONS = {
  cameriere: 'Usato da chi prende ordini ai tavoli, gestisce la sala e invia le comande.',
  cucina: 'Riceve tutte le comande inviate dalla sala. È la coda unica per cucina, bar o preparazioni operative.',
  cucina_pro: 'Riceve le comande assegnate alla cucina.',
  bar: 'Riceve ordini e preparazioni assegnati al bar.',
  pizzeria: 'Riceve le comande assegnate alla pizzeria.',
  cucina_sg: 'Riceve le preparazioni dedicate al senza glutine.',
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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function hasActiveSubscription(user) {
  if (!user || !['active', 'trialing'].includes(user.subscription_status)) return false;
  const periodEnd = user.subscription_current_period_end || user.end_subscription;
  if (!periodEnd) return true;
  const periodEndDate = new Date(periodEnd);
  return !Number.isNaN(periodEndDate.getTime()) && periodEndDate.getTime() >= Date.now();
}

function isUnpaidSignupOwner(user) {
  if (!user || (user.staff_role && user.staff_role !== STAFF_ROLES.OWNER)) return false;
  if (hasActiveSubscription(user)) return false;
  return !user.stripe_subscription_id;
}

function planAllowsStaffRole(user, role) {
  if (!hasActiveSubscription(user)) return false;
  if (user.subscription_plan === 'pro') return true;
  return user.subscription_plan === 'starter' && [STAFF_ROLES.CAMERIERE, STAFF_ROLES.CUCINA].includes(role);
}

function staffRoleLabel(role, owner) {
  switch (role) {
    case STAFF_ROLES.CAMERIERE: return 'Sala';
    case STAFF_ROLES.CUCINA: return owner?.subscription_plan === 'starter' ? 'Ordini' : 'Cucina';
    case STAFF_ROLES.BAR: return 'Bar';
    case STAFF_ROLES.PIZZERIA: return 'Pizzeria';
    case STAFF_ROLES.CUCINA_SG: return 'Cucina SG';
    default: return role;
  }
}

function staffAccessRoleLabel(role, plan) {
  if (role === STAFF_ROLES.CUCINA && plan === 'starter') return 'Ordini';
  return staffRoleLabel(role, { subscription_plan: plan });
}

function staffAccessDescription(role, plan) {
  if (role === STAFF_ROLES.CUCINA && plan === 'pro') return STAFF_ACCESS_DESCRIPTIONS.cucina_pro;
  return STAFF_ACCESS_DESCRIPTIONS[role] || '';
}

async function staffSettingsPayload(owner) {
  if (!owner || !owner.id || !strapi.db.connection) return [];
  try {
    await strapi.db.connection.raw('select public.sync_owner_staff_accounts(?)', [owner.id]);
    await applyStaffActiveState(strapi, owner.id, STAFF_ROLES.CAMERIERE, true);
  } catch (err) {
    strapi.log.warn(`billing status: sync staff fallita per user ${owner.id}: ${err.message}`);
  }

  const rows = await strapi.db.connection('restaurant_staff as staff')
    .leftJoin('up_users as user', 'user.id', 'staff.user_id')
    .select([
      'staff.role',
      'staff.active',
      'staff.display_name',
      'user.username',
      'user.blocked',
    ])
    .where('staff.owner_id', owner.id)
    .whereIn('staff.role', MANAGED_STAFF_ROLES);

  const byRole = new Map((rows || []).map((row) => [row.role, row]));
  return MANAGED_STAFF_ROLES.map((role) => {
    const row = byRole.get(role) || {};
    const planAllowed = planAllowsStaffRole(owner, role);
    const isWaiter = role === STAFF_ROLES.CAMERIERE;
    return {
      role,
      label: staffRoleLabel(role, owner),
      active: isWaiter ? true : row.active !== false,
      plan_allowed: planAllowed,
      can_toggle: !isWaiter && planAllowed,
      blocked: !!row.blocked,
      username: row.username || null,
      display_name: row.display_name || row.username || null,
    };
  });
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

async function restaurantNameForOwner(owner) {
  if (!owner) return 'ComforTables';
  if (!strapi.db.connection) return owner.username || 'ComforTables';
  try {
    const row = await strapi.db.connection('website_configs as config')
      .join('website_configs_fk_user_lnk as owner_lnk', 'owner_lnk.website_config_id', 'config.id')
      .select(['config.restaurant_name'])
      .where('owner_lnk.user_id', owner.id)
      .orderBy('config.id', 'desc')
      .first();
    return row?.restaurant_name || owner.username || 'ComforTables';
  } catch (err) {
    strapi.log.warn(`staff access email: nome ristorante non disponibile per user ${owner.id}: ${err.message}`);
    return owner.username || 'ComforTables';
  }
}

async function websiteConfigForOwner(ownerId) {
  if (!ownerId || !strapi.db.connection) return null;
  try {
    return await strapi.db.connection('website_configs as config')
      .join('website_configs_fk_user_lnk as owner_lnk', 'owner_lnk.website_config_id', 'config.id')
      .select(['config.id', 'config.restaurant_name', 'config.site_url'])
      .where('owner_lnk.user_id', ownerId)
      .orderBy('config.id', 'desc')
      .first();
  } catch (err) {
    strapi.log.warn(`website config lookup fallito per user ${ownerId}: ${err.message}`);
    return null;
  }
}

function buildPlaceholderSiteHtml(username) {
  const safeUsername = escapeHtml(username);
  return `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeUsername} - Sito in costruzione</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet">
    <style>
        body { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); }
        .construction-card { text-align: center; max-width: 500px; padding: 3rem 2rem; }
        .construction-icon { font-size: 4rem; color: #6c757d; margin-bottom: 1.5rem; }
    </style>
</head>
<body>
    <div class="card shadow-sm construction-card">
        <div class="construction-icon"><i class="bi bi-tools"></i></div>
        <h1 class="h3 mb-3">Sito in costruzione</h1>
        <p class="text-muted mb-4">Il sito menu di <strong>${safeUsername}</strong> è in fase di preparazione. Torna a trovarci presto!</p>
        <div class="d-flex justify-content-center gap-2">
            <a href="/" class="btn btn-outline-secondary">Torna alla home</a>
        </div>
    </div>
</body>
</html>`;
}

async function writePlaceholderSite(owner) {
  try {
    const sitesDir = path.resolve(strapi.dirs.app.root, '..', 'restaurant-sites');
    if (!fs.existsSync(sitesDir)) {
      fs.mkdirSync(sitesDir, { recursive: true });
    }
    const siteSlug = publicSiteSlug(owner.username);
    const filePath = path.resolve(sitesDir, `${siteSlug}.html`);
    if (!filePath.startsWith(`${sitesDir}${path.sep}`)) {
      throw new Error('Percorso sito fuori dalla directory consentita.');
    }
    fs.writeFileSync(filePath, buildPlaceholderSiteHtml(owner.username), 'utf-8');
    strapi.log.info(`Sito placeholder creato per ${owner.username}: ${filePath}`);
  } catch (err) {
    strapi.log.warn(`Impossibile creare il file sito per ${owner.username}: ${err.message}`);
  }
}

async function ensurePaidSignupProvisioning(userId) {
  const owner = userId
    ? await strapi.db.query('plugin::users-permissions.user').findOne({ where: { id: userId } })
    : null;
  if (!owner || !hasActiveSubscription(owner)) return null;

  const existingConfig = await websiteConfigForOwner(owner.id);
  if (existingConfig?.site_url && owner.url) return owner;

  const cInv = Number.parseInt(owner.signup_coperti_invernali, 10);
  const cEstRaw = Number.parseInt(owner.signup_coperti_estivi, 10);
  const copertiInvernali = Number.isFinite(cInv) && cInv > 0 ? cInv : null;
  const copertiEstivi = Number.isFinite(cEstRaw) && cEstRaw > 0 ? cEstRaw : copertiInvernali;

  if (!existingConfig && !copertiInvernali) {
    strapi.log.warn(`post-payment provisioning: dati coperti mancanti per user ${owner.id}`);
    return owner;
  }

  const siteBaseUrl = process.env.SITE_BASE_URL || 'http://localhost:1337';
  const siteSlug = publicSiteSlug(owner.username);
  const siteUrl = `${siteBaseUrl.replace(/\/+$/, '')}/sites/${siteSlug}`;
  const restaurantName =
    (typeof owner.signup_restaurant_name === 'string' && owner.signup_restaurant_name.trim()) ||
    owner.username ||
    'Ristorante';

  if (!existingConfig) {
    await strapi.documents('api::website-config.website-config').create({
      data: {
        restaurant_name: restaurantName,
        site_url: siteUrl,
        coperti_invernali: copertiInvernali,
        coperti_estivi: copertiEstivi,
        fk_user: { connect: [{ id: owner.id }] },
      },
    });
  }

  await writePlaceholderSite(owner);
  const updated = await strapi.db.query('plugin::users-permissions.user').update({
    where: { id: owner.id },
    data: {
      url: existingConfig?.site_url || siteUrl,
      signup_restaurant_name: null,
      signup_coperti_invernali: null,
      signup_coperti_estivi: null,
    },
  });
  return updated;
}

async function listStaffAccessAccounts(owner, plan) {
  const roles = STAFF_ACCESS_ROLES_BY_PLAN[plan] || [];
  if (!owner?.id || roles.length === 0 || !strapi.db.connection) return [];

  const rows = await strapi.db.connection('restaurant_staff as staff')
    .join('up_users as user', 'user.id', 'staff.user_id')
    .select(['staff.role', 'user.username'])
    .where('staff.owner_id', owner.id)
    .whereIn('staff.role', roles)
    .where('user.blocked', false);

  const byRole = new Map((rows || []).map((row) => [row.role, row.username]));
  return roles
    .map((role) => ({
      role,
      label: staffAccessRoleLabel(role, plan),
      username: byRole.get(role) || null,
      description: staffAccessDescription(role, plan),
    }))
    .filter((item) => item.username);
}

async function claimStaffAccessEmail(ownerId, plan) {
  if (!ownerId || !plan || !strapi.db.connection) return false;
  const result = await strapi.db.connection.raw(`
    update up_users
    set staff_access_email_sent_at = now(),
        staff_access_email_sent_plan = ?
    where id = ?
      and coalesce(staff_access_email_sent_plan, '') <> ?
    returning id
  `, [plan, ownerId, plan]);
  return (result?.rows || []).length > 0;
}

async function resetStaffAccessEmailClaim(ownerId, previousPlan) {
  if (!ownerId || !strapi.db.connection) return;
  try {
    await strapi.db.connection('up_users')
      .where('id', ownerId)
      .update({
        staff_access_email_sent_at: null,
        staff_access_email_sent_plan: previousPlan || null,
      });
  } catch (err) {
    strapi.log.warn(`staff access email: reset claim fallito per user ${ownerId}: ${err.message}`);
  }
}

function buildStaffAccessEmail({ owner, restaurantName, plan, accounts }) {
  const planLabel = plan === 'pro' ? 'Professionale' : 'Essenziale';
  const loginUrl = `${getFrontendUrl()}/login`;
  const ownerUsername = owner.username || owner.email || 'titolare';
  const textLines = [
    `Ciao ${restaurantName},`,
    '',
    'la registrazione è completata e il tuo gestionale ComforTables è pronto.',
    '',
    `Per accedere usa questo link: ${loginUrl}`,
    '',
    'La password è la stessa scelta durante la registrazione. Potrai modificarla in seguito quando la gestione password staff sarà disponibile.',
    '',
    'Account titolare',
    ownerUsername,
    '',
    `Profili inclusi nel piano ${planLabel}`,
    '',
  ];

  for (const account of accounts) {
    textLines.push(account.label);
    textLines.push(`Account: ${account.username}`);
    textLines.push(account.description);
    textLines.push('');
  }

  textLines.push('Grazie,');
  textLines.push('ComforTables');

  const staffHtml = accounts.map((account) => `
    <div style="margin:18px 0;padding:14px 16px;border:1px solid #e5e7eb;border-radius:8px;">
      <h3 style="margin:0 0 8px;font-size:16px;color:#111827;">${escapeHtml(account.label)}</h3>
      <p style="margin:0 0 6px;color:#374151;"><strong>Account:</strong> ${escapeHtml(account.username)}</p>
      <p style="margin:0;color:#4b5563;">${escapeHtml(account.description)}</p>
    </div>
  `).join('');

  return {
    subject: 'Accessi ComforTables attivati',
    text: textLines.join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;">
        <p>Ciao ${escapeHtml(restaurantName)},</p>
        <p>la registrazione è completata e il tuo gestionale ComforTables è pronto.</p>
        <p>Per accedere usa questo link:<br><a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></p>
        <p>La password è la stessa scelta durante la registrazione. Potrai modificarla in seguito quando la gestione password staff sarà disponibile.</p>
        <h2 style="font-size:18px;margin:24px 0 8px;">Account titolare</h2>
        <p style="margin:0 0 18px;"><strong>${escapeHtml(ownerUsername)}</strong></p>
        <h2 style="font-size:18px;margin:24px 0 8px;">Profili inclusi nel piano ${escapeHtml(planLabel)}</h2>
        ${staffHtml}
        <p style="margin-top:24px;">Grazie,<br>ComforTables</p>
      </div>
    `,
  };
}

async function sendStaffAccessEmailIfNeeded(userId) {
  const owner = userId
    ? await strapi.db.query('plugin::users-permissions.user').findOne({ where: { id: userId } })
    : null;
  const plan = normalizePlanKey(owner?.subscription_plan);
  if (!owner) {
    strapi.log.warn(`staff access email: owner non trovato per userId=${userId || 'vuoto'}.`);
    return;
  }
  if (!owner.email) {
    strapi.log.warn(`staff access email: email titolare mancante per user ${owner.id}.`);
    return;
  }
  if (!plan) {
    strapi.log.warn(`staff access email: piano non valido per user ${owner.id}, subscription_plan=${owner.subscription_plan || 'vuoto'}.`);
    return;
  }
  if (!hasActiveSubscription(owner)) {
    strapi.log.warn(`staff access email: subscription non attiva per user ${owner.id}, status=${owner.subscription_status || 'vuoto'}.`);
    return;
  }

  const accounts = await listStaffAccessAccounts(owner, plan);
  const expectedCount = STAFF_ACCESS_ROLES_BY_PLAN[plan]?.length || 0;
  if (accounts.length < expectedCount) {
    const found = accounts.map((account) => account.role).join(',') || 'nessuno';
    strapi.log.warn(`staff access email: account staff incompleti per user ${owner.id}, piano ${plan}. trovati=${found}, attesi=${expectedCount}.`);
    return;
  }

  const previousPlan = owner.staff_access_email_sent_plan || null;
  const claimed = await claimStaffAccessEmail(owner.id, plan);
  if (!claimed) {
    strapi.log.info(`staff access email: gia inviata per user ${owner.id}, piano ${plan}.`);
    return;
  }

  try {
    const restaurantName = await restaurantNameForOwner(owner);
    const email = buildStaffAccessEmail({ owner, restaurantName, plan, accounts });
    strapi.log.info(`staff access email: invio a ${owner.email} per user ${owner.username}, piano ${plan}.`);
    await strapi.plugin('email').service('email').send({
      to: owner.email,
      from: process.env.SMTP_DEFAULT_FROM || 'no-reply@example.com',
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    strapi.log.info(`Email accessi staff inviata a ${owner.email} per user ${owner.username}, piano ${plan}.`);
  } catch (err) {
    await resetStaffAccessEmailClaim(owner.id, previousPlan);
    strapi.log.warn(`Impossibile inviare email accessi staff per ${owner.username}: ${err.message}`);
  }
}

async function syncStaffAndSendAccessEmail(userId) {
  await ensurePaidSignupProvisioning(userId);
  await syncOwnerStaffAccounts(userId);
  await sendStaffAccessEmailIfNeeded(userId);
}

async function cleanupSignupArtifacts(ownerId) {
  if (!ownerId || !strapi.db.connection) return;
  const knex = strapi.db.connection;

  const staffRows = await knex('restaurant_staff as staff')
    .join('up_users as user', 'user.id', 'staff.user_id')
    .select(['staff.user_id'])
    .where('staff.owner_id', ownerId)
    .where('user.email', 'like', `staff+${ownerId}.%@staff.local.tavolo`);
  const staffIds = [...new Set((staffRows || []).map((row) => row.user_id).filter(Boolean))];

  if (staffIds.length > 0) {
    await knex('restaurant_staff').where('owner_id', ownerId).whereIn('user_id', staffIds).delete();
    if (await knex.schema.hasTable('up_users_fk_owner_lnk')) {
      await knex('up_users_fk_owner_lnk').whereIn('user_id', staffIds).delete();
    }
    if (await knex.schema.hasTable('up_users_role_lnk')) {
      await knex('up_users_role_lnk').whereIn('user_id', staffIds).delete();
    }
    await knex('up_users').whereIn('id', staffIds).delete();
  }

  if (
    await knex.schema.hasTable('website_configs') &&
    await knex.schema.hasTable('website_configs_fk_user_lnk')
  ) {
    const configRows = await knex('website_configs_fk_user_lnk')
      .select(['website_config_id'])
      .where('user_id', ownerId);
    const configIds = [...new Set((configRows || []).map((row) => row.website_config_id).filter(Boolean))];
    if (configIds.length > 0) {
      await knex('website_configs_fk_user_lnk').where('user_id', ownerId).delete();
      await knex('website_configs').whereIn('id', configIds).delete();
    }
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
    const canManageStaff = billingUser && user && billingUser.id === user.id;
    return ctx.send({
      data: {
        ...safeUser(billingUser),
        ...staffUserPayload(actor ? actor.actor : user, billingUser),
        staff_departments: canManageStaff ? await staffSettingsPayload(billingUser) : undefined,
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
      await syncStaffAndSendAccessEmail(user.id);

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
      await syncStaffAndSendAccessEmail(billingUser.id);

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
      await syncStaffAndSendAccessEmail(billingUser.id);

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
      await syncStaffAndSendAccessEmail(billingUser.id);

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

  async abandonSignup(ctx) {
    const user = await requireBillingUser(ctx);
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');
    const actor = await resolveStaffContext(strapi, user);
    if (actor && ![STAFF_ROLES.OWNER].includes(actor.role)) {
      return ctx.forbidden('Solo il titolare puo annullare la registrazione.');
    }

    const owner = actor && actor.owner ? actor.owner : user;
    const fresh = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: owner.id },
    });
    if (!isUnpaidSignupOwner(fresh)) {
      return ctx.badRequest('Registrazione non annullabile: account gia attivo o associato a Stripe.');
    }

    try {
      await cleanupSignupArtifacts(fresh.id);
      await strapi.db.query('plugin::users-permissions.user').delete({ where: { id: fresh.id } });
      clearAuthCookies(ctx);
      return ctx.send({ data: { abandoned: true } });
    } catch (err) {
      strapi.log.error(`abandonSignup failed for user ${fresh.id}: ${err.message}`);
      ctx.status = 500;
      return ctx.send({ error: { message: 'Annullamento registrazione non riuscito.' } });
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
          await syncStaffAndSendAccessEmail(userId);
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
          await syncStaffAndSendAccessEmail(user?.id);
        }
      }
    } catch (err) {
      strapi.log.error(`Stripe webhook processing failed: ${err.message}`);
      return ctx.internalServerError('Errore processamento webhook Stripe.');
    }

    return ctx.send({ received: true });
  },
};
