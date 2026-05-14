'use strict';

const crypto = require('crypto');
const {
  STAFF_ROLES,
  applyStaffActiveState,
  publicSiteSlug,
  resolveStaffContext,
  staffUserPayload,
  validatePublicUsername,
} = require('../../../utils/staff-access');
const {
  consumeRecoveryCode,
  encodeRecoveryCodes,
  generateEmailCode,
  hashEmailCode,
  verifyTwoFactorChallenge,
  verifyEmailCode,
} = require('../../../utils/two-factor-auth');
const {
  ROUTABLE_STAFF_ROLE_SET,
  listCategoryRouting,
  normalizeStation,
  ownerHasProfessionalRouting,
  updateCategoryRouting: saveCategoryRouting,
} = require('../../../utils/category-routing');
const {
  clearAuthCookies,
  setAuthCookies,
  stripJwtFromBodyIfCookieOnly,
} = require('../../../utils/auth-cookies');
const CAPACITY_MIN = 1;
const CAPACITY_MAX = 10000;
const LOGO_MAX_KB_DEFAULT = 2048;
const LOGO_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const TWO_FACTOR_EMAIL_TTL_MS = 10 * 60 * 1000;
const TWO_FACTOR_EMAIL_COOLDOWN_MS = 60 * 1000;
const MANAGED_STAFF_ROLES = [
  STAFF_ROLES.CAMERIERE,
  STAFF_ROLES.CUCINA,
  STAFF_ROLES.BAR,
  STAFF_ROLES.PIZZERIA,
  STAFF_ROLES.CUCINA_SG,
];

// ----- TOTP helpers (RFC 6238, SHA1, 6 digits, 30s) -----
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0, value = 0, output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str) {
  const clean = str.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const c of clean) {
    const idx = BASE32.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secret, counter) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) { buf[i] = counter & 0xff; counter = Math.floor(counter / 256); }
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (bin % 1000000).toString().padStart(6, '0');
}

function verifyTotp(secret, token, window = 1) {
  if (!/^\d{6}$/.test(String(token || ''))) return false;
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    if (hotp(secret, counter + w) === token) return true;
  }
  return false;
}

function generateRecoveryCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const a = crypto.randomBytes(4).toString('hex');
    const b = crypto.randomBytes(4).toString('hex');
    codes.push(`${a}-${b}`);
  }
  return codes;
}

// ----- password verification -----
async function verifyUserPassword(strapi, user, password) {
  if (!password) return false;
  const fresh = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: { id: user.id },
    select: ['id', 'password'],
  });
  if (!fresh || !fresh.password) return false;
  return strapi.plugin('users-permissions').service('user').validatePassword(password, fresh.password);
}

async function verifySensitiveAccountChange(strapi, user, body = {}) {
  const fresh = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: { id: user.id },
    select: [
      'id',
      'password',
      'two_factor_enabled',
      'two_factor_secret',
      'two_factor_method',
      'two_factor_email_code_hash',
      'two_factor_email_code_expires_at',
    ],
  });
  if (!fresh) return { ok: false, message: 'Utente non trovato' };

  if (fresh.two_factor_enabled && fresh.two_factor_method === 'email') {
    if (!fresh.two_factor_email_code_expires_at || new Date(fresh.two_factor_email_code_expires_at).getTime() < Date.now()) {
      return { ok: false, message: 'Codice email scaduto. Richiedi un nuovo codice.' };
    }
    if (!verifyEmailCode(strapi, fresh.two_factor_email_code_hash, body.code)) {
      return { ok: false, message: 'Codice email non valido.' };
    }
    await strapi.db.query('plugin::users-permissions.user').update({
      where: { id: fresh.id },
      data: {
        two_factor_email_code_hash: null,
        two_factor_email_code_expires_at: null,
      },
    });
    return { ok: true };
  }

  if (fresh.two_factor_enabled && fresh.two_factor_method !== 'email') {
    const passwordOk = await verifyUserPassword(strapi, user, body.password);
    if (passwordOk) return { ok: true };
    if (!verifyTotp(fresh.two_factor_secret, body.code)) {
      return { ok: false, message: 'Inserisci un codice 2FA valido oppure la password.' };
    }
    return { ok: true };
  }

  const passwordOk = await verifyUserPassword(strapi, user, body.password);
  if (!passwordOk) return { ok: false, message: 'Password errata' };
  return { ok: true };
}

function stripPrivateUserFields(user) {
  const safe = { ...(user || {}) };
  delete safe.password;
  delete safe.resetPasswordToken;
  delete safe.confirmationToken;
  delete safe.two_factor_secret;
  delete safe.two_factor_recovery_codes;
  return safe;
}

async function authUserPayload(strapi, user) {
  const safe = stripPrivateUserFields(user);
  const actor = await resolveStaffContext(strapi, safe);
  if (actor) Object.assign(safe, staffUserPayload(actor.actor, actor.owner));
  return safe;
}

function maskEmail(email) {
  const value = String(email || '').trim();
  const [local, domain] = value.split('@');
  if (!local || !domain) return value;
  const visible = local.length <= 2 ? local[0] : `${local.slice(0, 2)}***${local.slice(-1)}`;
  return `${visible}@${domain}`;
}

async function sendTwoFactorEmailCode(strapi, user, { force = false } = {}) {
  const fresh = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: { id: user.id },
    select: ['id', 'email', 'two_factor_email_last_sent_at'],
  });
  if (!fresh?.email) return { ok: false, message: 'Email account non disponibile.' };

  const lastSentAt = fresh.two_factor_email_last_sent_at
    ? new Date(fresh.two_factor_email_last_sent_at).getTime()
    : 0;
  if (!force && lastSentAt && Date.now() - lastSentAt < TWO_FACTOR_EMAIL_COOLDOWN_MS) {
    return { ok: false, message: 'Attendi un minuto prima di richiedere un nuovo codice.' };
  }

  const code = generateEmailCode();
  await strapi.db.query('plugin::users-permissions.user').update({
    where: { id: user.id },
    data: {
      two_factor_email_code_hash: hashEmailCode(strapi, code),
      two_factor_email_code_expires_at: new Date(Date.now() + TWO_FACTOR_EMAIL_TTL_MS),
      two_factor_email_last_sent_at: new Date(),
    },
  });

  await strapi.plugin('email').service('email').send({
    to: fresh.email,
    subject: 'Codice di accesso ComforTables',
    text: `Il tuo codice di accesso ComforTables e': ${code}\n\nScade tra 10 minuti. Se non hai richiesto tu questo accesso, ignora questa email.`,
    html: `<p>Il tuo codice di accesso ComforTables e':</p><p style="font-size:24px;font-weight:700;letter-spacing:4px;">${code}</p><p>Scade tra 10 minuti. Se non hai richiesto tu questo accesso, ignora questa email.</p>`,
  });

  return { ok: true, email: fresh.email };
}

function parseCapacity(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function isValidCapacity(value) {
  return Number.isFinite(value) && value >= CAPACITY_MIN && value <= CAPACITY_MAX;
}

function logoMaxKb() {
  const raw = parseInt(process.env.LOGO_MAX_KB || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : LOGO_MAX_KB_DEFAULT;
}

function sameEntity(a, b) {
  if (!a || !b) return false;
  return (a.documentId && b.documentId && a.documentId === b.documentId) || (a.id && b.id && a.id === b.id);
}

async function findUserWebsiteConfig(userId, populate = []) {
  const configs = await strapi.documents('api::website-config.website-config').findMany({
    filters: { fk_user: { id: { $eq: userId } } },
    populate,
  });
  return configs && configs.length > 0 ? configs[0] : null;
}

async function validateLogoFile(strapi, user, logoId, existingConfig = null) {
  const id = Number(logoId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: 'Logo non valido.' };
  }

  const file = await strapi.db.query('plugin::upload.file').findOne({
    where: { id },
    populate: ['related'],
  });
  if (!file) return { ok: false, message: 'Logo non trovato.' };
  if (!LOGO_ALLOWED_MIME.has(file.mime)) {
    return { ok: false, message: 'Formato logo non supportato. Usa PNG, JPEG, WEBP o GIF.' };
  }
  if (Number(file.size || 0) > logoMaxKb()) {
    return { ok: false, message: `Logo troppo grande. Limite: ${logoMaxKb()} KB.` };
  }

  const related = Array.isArray(file.related) ? file.related : [];
  if (related.length > 0) {
    const allowed = existingConfig && related.some((entity) => sameEntity(entity, existingConfig));
    if (!allowed) {
      return { ok: false, message: 'Logo già associato a un altro contenuto.' };
    }
  }

  return { ok: true, id };
}

async function requireAccountUser(ctx) {
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
    strapi.log.warn(`Account JWT non valido: ${err.message}`);
    return null;
  }
}

function hasActiveSubscription(user) {
  if (!user || !['active', 'trialing'].includes(user.subscription_status)) return false;
  const periodEnd = user.subscription_current_period_end || user.end_subscription;
  if (!periodEnd) return true;
  const periodEndDate = new Date(periodEnd);
  return !Number.isNaN(periodEndDate.getTime()) && periodEndDate.getTime() >= Date.now();
}

function planAllowsRole(user, role) {
  if (!hasActiveSubscription(user)) return false;
  if (user.subscription_plan === 'pro') return true;
  return user.subscription_plan === 'starter' && [STAFF_ROLES.CAMERIERE, STAFF_ROLES.CUCINA].includes(role);
}

function staffRoleLabel(role) {
  switch (role) {
    case STAFF_ROLES.CAMERIERE: return 'Sala';
    case STAFF_ROLES.CUCINA: return 'Cucina';
    case STAFF_ROLES.BAR: return 'Bar';
    case STAFF_ROLES.PIZZERIA: return 'Pizzeria';
    case STAFF_ROLES.CUCINA_SG: return 'Cucina SG';
    default: return role;
  }
}

async function staffSettingsPayload(strapi, owner) {
  try {
    await applyStaffActiveState(strapi, owner.id, STAFF_ROLES.CAMERIERE, true);
  } catch (_err) {
    // Best effort: the UI still reports cameriere as non-disattivabile.
  }

  const rows = strapi.db.connection
    ? await strapi.db.connection('restaurant_staff as staff')
      .leftJoin('up_users as user', 'user.id', 'staff.user_id')
      .select([
        'staff.role',
        'staff.active',
        'staff.display_name',
        'user.id as user_id',
        'user.username',
        'user.blocked',
      ])
      .where('staff.owner_id', owner.id)
      .whereIn('staff.role', MANAGED_STAFF_ROLES)
    : [];

  const routingAllowed = ownerHasProfessionalRouting(owner);
  const subscriptionActive = hasActiveSubscription(owner);
  const routingBlockedReason = routingAllowed
    ? null
    : (subscriptionActive ? 'pro_required' : 'subscription_required');
  let categoryRouting = [];
  try {
    categoryRouting = await listCategoryRouting(strapi, owner);
  } catch (err) {
    strapi.log.warn(`staffSettingsPayload: routing categorie non disponibile per user ${owner.id}: ${err.message}`);
  }

  const categoriesByRole = new Map();
  for (const item of categoryRouting) {
    const role = normalizeStation(item.staff_role) || STAFF_ROLES.CUCINA;
    if (!categoriesByRole.has(role)) categoriesByRole.set(role, []);
    categoriesByRole.get(role).push(item);
  }

  const byRole = new Map((rows || []).map((row) => [row.role, row]));
  return MANAGED_STAFF_ROLES.map((role) => {
    const row = byRole.get(role) || {};
    const planAllowed = planAllowsRole(owner, role);
    const isWaiter = role === STAFF_ROLES.CAMERIERE;
    return {
      role,
      label: staffRoleLabel(role),
      active: isWaiter ? true : row.active !== false,
      plan_allowed: planAllowed,
      can_toggle: !isWaiter && planAllowed,
      blocked: !!row.blocked,
      username: row.username || null,
      display_name: row.display_name || row.username || null,
      routing_allowed: routingAllowed,
      routing_blocked_reason: routingBlockedReason,
      subscription_plan: owner.subscription_plan || null,
      categories: ROUTABLE_STAFF_ROLE_SET.has(role) ? (categoriesByRole.get(role) || []) : [],
    };
  });
}

module.exports = {
  async updateProfile(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const { username, email, staff_department_role: staffDepartmentRole } = ctx.request.body || {};

    if (staffDepartmentRole) {
      const owner = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { id: user.id },
        select: ['id', 'subscription_status', 'subscription_plan', 'subscription_current_period_end', 'end_subscription', 'staff_role'],
      });
      if (!owner || (owner.staff_role && owner.staff_role !== STAFF_ROLES.OWNER)) {
        return ctx.forbidden('Solo il titolare puo gestire i reparti.');
      }

      const role = String(staffDepartmentRole || '').trim().toLowerCase();
      if (!MANAGED_STAFF_ROLES.includes(role)) {
        return ctx.badRequest('Reparto non valido.');
      }

      if (strapi.db.connection) {
        try {
          await strapi.db.connection.raw('select public.sync_owner_staff_accounts(?)', [user.id]);
        } catch (err) {
          strapi.log.warn(`updateProfile staff: sync staff fallita per user ${user.id}: ${err.message}`);
        }
      }

      const active = role === STAFF_ROLES.CAMERIERE ? true : !!(ctx.request.body || {}).active;
      const updated = await applyStaffActiveState(strapi, user.id, role, active);
      if (!updated) return ctx.notFound('Account reparto non trovato.');

      const refreshedOwner = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { id: user.id },
        select: ['id', 'subscription_status', 'subscription_plan', 'subscription_current_period_end', 'end_subscription'],
      });
      return ctx.send({ data: await staffSettingsPayload(strapi, refreshedOwner) });
    }

    const data = {};
    if (username && username !== user.username) data.username = String(username).trim();
    if (email && email !== user.email) data.email = String(email).trim().toLowerCase();
    if (Object.keys(data).length === 0) return ctx.send({ success: true, user });

    const confirmation = await verifySensitiveAccountChange(strapi, user, ctx.request.body || {});
    if (!confirmation.ok) return ctx.badRequest(confirmation.message);

    if (data.email) {
      const exists = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { email: data.email, id: { $ne: user.id } },
      });
      if (exists) return ctx.badRequest('Email già in uso');
    }
    if (data.username) {
      const usernameValidation = validatePublicUsername(data.username);
      if (!usernameValidation.ok) return ctx.badRequest(usernameValidation.message);
      data.username = usernameValidation.value;

      const exists = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { username: data.username, id: { $ne: user.id } },
      });
      if (exists) return ctx.badRequest('Username già in uso');
    }

    const updated = await strapi.plugin('users-permissions').service('user').edit(user.id, data);
    const { password, resetPasswordToken, confirmationToken, ...safe } = updated;
    return ctx.send({ success: true, user: safe });
  },

  async listStaff(ctx) {
    const user = await requireAccountUser(ctx);
    if (!user) return ctx.unauthorized();

    const owner = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: user.id },
      select: ['id', 'subscription_status', 'subscription_plan', 'subscription_current_period_end', 'end_subscription', 'staff_role'],
    });
    if (!owner || (owner.staff_role && owner.staff_role !== STAFF_ROLES.OWNER)) {
      return ctx.forbidden('Solo il titolare puo gestire i reparti.');
    }

    if (strapi.db.connection) {
      try {
        await strapi.db.connection.raw('select public.sync_owner_staff_accounts(?)', [user.id]);
      } catch (err) {
        strapi.log.warn(`listStaff: sync staff fallita per user ${user.id}: ${err.message}`);
      }
    }

    return ctx.send({ data: await staffSettingsPayload(strapi, owner) });
  },

  async updateStaff(ctx) {
    const user = await requireAccountUser(ctx);
    if (!user) return ctx.unauthorized();

    const owner = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: user.id },
      select: ['id', 'staff_role'],
    });
    if (!owner || (owner.staff_role && owner.staff_role !== STAFF_ROLES.OWNER)) {
      return ctx.forbidden('Solo il titolare puo gestire i reparti.');
    }

    const role = String(ctx.params.role || '').trim().toLowerCase();
    if (!MANAGED_STAFF_ROLES.includes(role)) {
      return ctx.badRequest('Reparto non valido.');
    }

    const active = role === STAFF_ROLES.CAMERIERE ? true : !!(ctx.request.body || {}).active;
    if (strapi.db.connection) {
      try {
        await strapi.db.connection.raw('select public.sync_owner_staff_accounts(?)', [user.id]);
      } catch (err) {
        strapi.log.warn(`updateStaff: sync staff fallita per user ${user.id}: ${err.message}`);
      }
    }

    const updated = await applyStaffActiveState(strapi, user.id, role, active);
    if (!updated) return ctx.notFound('Account reparto non trovato.');

    const refreshedOwner = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: user.id },
      select: ['id', 'subscription_status', 'subscription_plan', 'subscription_current_period_end', 'end_subscription'],
    });
    return ctx.send({ data: await staffSettingsPayload(strapi, refreshedOwner) });
  },

  async updateCategoryRouting(ctx) {
    const user = await requireAccountUser(ctx);
    if (!user) return ctx.unauthorized();

    const owner = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: user.id },
      select: ['id', 'subscription_status', 'subscription_plan', 'subscription_current_period_end', 'end_subscription', 'staff_role'],
    });
    if (!owner || (owner.staff_role && owner.staff_role !== STAFF_ROLES.OWNER)) {
      return ctx.forbidden('Solo il titolare puo gestire i reparti.');
    }
    if (!ownerHasProfessionalRouting(owner)) {
      ctx.status = 403;
      ctx.body = {
        error: {
          code: 'STAFF_PLAN_FORBIDDEN',
          message: 'Le assegnazioni delle categorie richiedono il piano Professionale.',
        },
      };
      return;
    }

    const body = ctx.request.body || {};
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const role = normalizeStation(body.staff_role || body.role);
    if (!category) return ctx.badRequest('Categoria obbligatoria.');
    if (!role) return ctx.badRequest('Reparto non valido.');

    try {
      const saved = await saveCategoryRouting(strapi, owner, category, role);
      if (!saved) return ctx.internalServerError('Routing categorie non disponibile.');

      // Propaga l'assegnazione al flag `is_beverage` degli element nella stessa
      // categoria: lo slot bevande deve continuare a coincidere con lo slot
      // staff "bar" anche dopo riassegnazioni manuali del routing.
      try {
        const knex = strapi.db.connection;
        if (knex) {
          const targetIsBeverage = role === STAFF_ROLES.BAR;
          const elementIds = await knex('elements as e')
            .join('elements_fk_user_lnk as l', 'l.element_id', 'e.id')
            .where('l.user_id', owner.id)
            .andWhereRaw('lower(e.category) = lower(?)', [category])
            .pluck('e.id');
          if (elementIds.length > 0) {
            await knex('elements')
              .whereIn('id', elementIds)
              .update({ is_beverage: targetIsBeverage, updated_at: new Date() });
          }
        }
      } catch (propErr) {
        strapi.log.warn(`updateCategoryRouting: propagazione is_beverage fallita: ${propErr.message}`);
      }

      return ctx.send({ data: await staffSettingsPayload(strapi, owner) });
    } catch (err) {
      strapi.log.error('updateCategoryRouting:', err);
      return ctx.internalServerError('Impossibile aggiornare assegnazione categoria.');
    }
  },

  async updatePassword(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const { current_password, password, password_confirmation } = ctx.request.body || {};
    if (!password || password.length < 6) return ctx.badRequest('La password deve essere di almeno 6 caratteri');
    if (password !== password_confirmation) return ctx.badRequest('Le password non coincidono');
    const ok = await verifyUserPassword(strapi, user, current_password);
    if (!ok) return ctx.badRequest('Password corrente errata');
    await strapi.plugin('users-permissions').service('user').edit(user.id, { password });
    return ctx.send({ success: true });
  },

  async getWebsiteConfig(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();

    const config = await findUserWebsiteConfig(user.id, ['logo']);
    return ctx.send({ data: config });
  },

  async upsertWebsiteConfig(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();

    const body = ctx.request.body || {};
    const confirmation = await verifySensitiveAccountChange(strapi, user, body);
    if (!confirmation.ok) return ctx.badRequest(confirmation.message);

    const cInv = parseCapacity(body.coperti_invernali);
    if (!isValidCapacity(cInv)) {
      return ctx.badRequest('coperti_invernali obbligatorio (intero 1..10000).');
    }

    let cEst = cInv;
    if (body.coperti_estivi !== undefined && body.coperti_estivi !== null && body.coperti_estivi !== '') {
      cEst = parseCapacity(body.coperti_estivi);
      if (!isValidCapacity(cEst)) {
        return ctx.badRequest('coperti_estivi non valido (intero 1..10000).');
      }
    }

    const siteBaseUrl = process.env.SITE_BASE_URL || 'http://localhost:1337';
    const siteSlug = publicSiteSlug(user.username);
    const siteUrl = `${siteBaseUrl.replace(/\/+$/, '')}/sites/${siteSlug}`;
    const restaurantName =
      (typeof body.restaurant_name === 'string' && body.restaurant_name.trim()) ||
      user.username ||
      'Ristorante';

    const data = {
      restaurant_name: restaurantName,
      site_url: siteUrl,
      coperti_invernali: cInv,
      coperti_estivi: cEst,
      fk_user: { connect: [{ id: user.id }] },
    };

    const existing = await findUserWebsiteConfig(user.id);
    if (body.logo !== undefined && body.logo !== null && body.logo !== '') {
      const logo = await validateLogoFile(strapi, user, body.logo, existing);
      if (!logo.ok) return ctx.badRequest(logo.message);
      data.logo = logo.id;
    }

    if (existing) {
      await strapi.documents('api::website-config.website-config').update({
        documentId: existing.documentId,
        data,
      });
    } else {
      await strapi.documents('api::website-config.website-config').create({ data });
    }

    await strapi.db.query('plugin::users-permissions.user').update({
      where: { id: user.id },
      data: { url: siteUrl },
    });

    const config = await findUserWebsiteConfig(user.id, ['logo']);
    return ctx.send({ data: config });
  },

  async destroy(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const { password } = ctx.request.body || {};
    const ok = await verifyUserPassword(strapi, user, password);
    if (!ok) return ctx.badRequest('Password errata');

    try {
      const menus = await strapi.documents('api::menu.menu').findMany({
        filters: { fk_user: { id: { $eq: user.id } } },
      });
      for (const m of menus) {
        await strapi.documents('api::menu.menu').delete({ documentId: m.documentId });
      }
      const configs = await strapi.documents('api::website-config.website-config').findMany({
        filters: { fk_user: { id: { $eq: user.id } } },
      });
      for (const c of configs) {
        await strapi.documents('api::website-config.website-config').delete({ documentId: c.documentId });
      }
    } catch (e) {
      strapi.log.warn('destroy: errore pulizia dati correlati: ' + e.message);
    }

    await strapi.db.query('plugin::users-permissions.user').delete({ where: { id: user.id } });
    clearAuthCookies(ctx);
    return ctx.send({ success: true, message: 'Account eliminato' });
  },

  async twoFactorStatus(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const fresh = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: user.id },
      select: ['id', 'two_factor_enabled', 'two_factor_secret', 'two_factor_method', 'two_factor_email_code_hash'],
    });
    return ctx.send({
      enabled: !!fresh?.two_factor_enabled,
      pending: (!!fresh?.two_factor_secret || !!fresh?.two_factor_email_code_hash) && !fresh?.two_factor_enabled,
      method: fresh?.two_factor_method || 'totp',
    });
  },

  async twoFactorEnable(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const current = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: user.id },
      select: ['id', 'two_factor_enabled'],
    });
    if (current?.two_factor_enabled) return ctx.badRequest('2FA già attiva');

    const secret = generateSecret();
    const recovery = generateRecoveryCodes();
    await strapi.db.query('plugin::users-permissions.user').update({
      where: { id: user.id },
      data: {
        two_factor_secret: secret,
        two_factor_method: 'totp',
        two_factor_enabled: false,
        two_factor_recovery_codes: encodeRecoveryCodes(strapi, recovery),
        two_factor_email_code_hash: null,
        two_factor_email_code_expires_at: null,
      },
    });
    const issuer = encodeURIComponent('CMS Restaurant');
    const label = encodeURIComponent(`${user.email}`);
    const otpauth = `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    return ctx.send({ secret, otpauth, recoveryCodes: recovery });
  },

  async twoFactorConfirm(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const { code } = ctx.request.body || {};
    const fresh = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: user.id },
      select: ['id', 'two_factor_secret'],
    });
    if (!fresh?.two_factor_secret) return ctx.badRequest('2FA non inizializzato');
    if (!verifyTotp(fresh.two_factor_secret, code)) return ctx.badRequest('Codice non valido');
    await strapi.db.query('plugin::users-permissions.user').update({
      where: { id: user.id },
      data: { two_factor_enabled: true },
    });
    return ctx.send({ success: true });
  },

  async twoFactorEmailEnable(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const current = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: user.id },
      select: ['id', 'email', 'two_factor_enabled'],
    });
    if (current?.two_factor_enabled) return ctx.badRequest('2FA già attiva');

    try {
      const sent = await sendTwoFactorEmailCode(strapi, current || user, { force: true });
      if (!sent.ok) return ctx.badRequest(sent.message);
      await strapi.db.query('plugin::users-permissions.user').update({
        where: { id: user.id },
        data: {
          two_factor_method: 'email',
          two_factor_secret: null,
          two_factor_enabled: false,
          two_factor_recovery_codes: null,
        },
      });
      return ctx.send({ success: true, method: 'email', emailHint: maskEmail(sent.email) });
    } catch (err) {
      strapi.log.error(`2FA email enable fallita: ${err.message}`);
      return ctx.internalServerError('Impossibile inviare il codice via email.');
    }
  },

  async twoFactorEmailConfirm(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const { code } = ctx.request.body || {};
    const fresh = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: user.id },
      select: ['id', 'two_factor_method', 'two_factor_email_code_hash', 'two_factor_email_code_expires_at'],
    });
    if (fresh?.two_factor_method !== 'email') return ctx.badRequest('2FA email non inizializzata');
    if (!fresh.two_factor_email_code_expires_at || new Date(fresh.two_factor_email_code_expires_at).getTime() < Date.now()) {
      return ctx.badRequest('Codice scaduto. Richiedi un nuovo codice.');
    }
    if (!verifyEmailCode(strapi, fresh.two_factor_email_code_hash, code)) {
      return ctx.badRequest('Codice non valido');
    }
    await strapi.db.query('plugin::users-permissions.user').update({
      where: { id: user.id },
      data: {
        two_factor_enabled: true,
        two_factor_email_code_hash: null,
        two_factor_email_code_expires_at: null,
      },
    });
    return ctx.send({ success: true });
  },

  async twoFactorEmailSendCode(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const fresh = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: user.id },
      select: ['id', 'email', 'two_factor_enabled', 'two_factor_method', 'two_factor_email_last_sent_at'],
    });
    if (!fresh?.two_factor_enabled || fresh.two_factor_method !== 'email') {
      return ctx.badRequest('2FA email non attiva');
    }
    try {
      const sent = await sendTwoFactorEmailCode(strapi, fresh);
      if (!sent.ok) {
        ctx.status = 429;
        ctx.body = { error: { code: 'RATE_LIMITED', message: sent.message } };
        return;
      }
      return ctx.send({ success: true, emailHint: maskEmail(sent.email) });
    } catch (err) {
      strapi.log.error(`2FA email code fallita: ${err.message}`);
      return ctx.internalServerError('Impossibile inviare il codice via email.');
    }
  },

  async twoFactorDisable(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const confirmation = await verifySensitiveAccountChange(strapi, user, ctx.request.body || {});
    if (!confirmation.ok) return ctx.badRequest(confirmation.message);
    await strapi.db.query('plugin::users-permissions.user').update({
      where: { id: user.id },
      data: {
        two_factor_secret: null,
        two_factor_method: 'totp',
        two_factor_enabled: false,
        two_factor_recovery_codes: null,
        two_factor_email_code_hash: null,
        two_factor_email_code_expires_at: null,
        two_factor_email_last_sent_at: null,
      },
    });
    return ctx.send({ success: true });
  },

  async twoFactorRegenerateRecovery(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const confirmation = await verifySensitiveAccountChange(strapi, user, ctx.request.body || {});
    if (!confirmation.ok) return ctx.badRequest(confirmation.message);
    const recovery = generateRecoveryCodes();
    await strapi.db.query('plugin::users-permissions.user').update({
      where: { id: user.id },
      data: { two_factor_recovery_codes: encodeRecoveryCodes(strapi, recovery) },
    });
    return ctx.send({ recoveryCodes: recovery });
  },

  async logout(ctx) {
    clearAuthCookies(ctx);
    return ctx.send({ success: true });
  },

  async twoFactorLogin(ctx) {
    const { challenge_token: challengeToken, code, recovery_code: recoveryCode } = ctx.request.body || {};
    const challenge = verifyTwoFactorChallenge(strapi, challengeToken);
    if (!challenge) return ctx.forbidden('Challenge 2FA non valida o scaduta');

    const user = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: challenge.id },
      populate: ['role', 'fk_owner'],
    });
    if (!user || user.blocked) return ctx.forbidden('Account non disponibile');
    if (!user.two_factor_enabled) {
      return ctx.badRequest('2FA non attiva');
    }

    if (user.two_factor_method === 'email') {
      if (!user.two_factor_email_code_expires_at || new Date(user.two_factor_email_code_expires_at).getTime() < Date.now()) {
        return ctx.badRequest('Codice scaduto. Richiedi un nuovo codice.');
      }
      if (!verifyEmailCode(strapi, user.two_factor_email_code_hash, code)) {
        return ctx.badRequest('Codice non valido');
      }
      await strapi.db.query('plugin::users-permissions.user').update({
        where: { id: user.id },
        data: {
          two_factor_email_code_hash: null,
          two_factor_email_code_expires_at: null,
        },
      });
    } else if (recoveryCode) {
      const result = consumeRecoveryCode(strapi, user.two_factor_recovery_codes || [], recoveryCode);
      if (!result.ok) return ctx.badRequest('Codice di recupero non valido');
      await strapi.db.query('plugin::users-permissions.user').update({
        where: { id: user.id },
        data: { two_factor_recovery_codes: result.nextCodes },
      });
    } else if (!verifyTotp(user.two_factor_secret, code)) {
      return ctx.badRequest('Codice non valido');
    }

    const jwt = await strapi.plugin('users-permissions').service('jwt').issue({ id: user.id });
    const body = {
      jwt,
      user: await authUserPayload(strapi, user),
    };
    setAuthCookies(ctx, jwt);
    ctx.body = body;
    stripJwtFromBodyIfCookieOnly(ctx);
    return;
  },

  async twoFactorEmailChallengeResend(ctx) {
    const { challenge_token: challengeToken } = ctx.request.body || {};
    const challenge = verifyTwoFactorChallenge(strapi, challengeToken);
    if (!challenge) return ctx.forbidden('Challenge 2FA non valida o scaduta');
    const user = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: challenge.id },
      select: ['id', 'email', 'two_factor_enabled', 'two_factor_method', 'two_factor_email_last_sent_at'],
    });
    if (!user || !user.two_factor_enabled || user.two_factor_method !== 'email') {
      return ctx.badRequest('2FA email non attiva');
    }
    try {
      const sent = await sendTwoFactorEmailCode(strapi, user);
      if (!sent.ok) {
        ctx.status = 429;
        ctx.body = { error: { code: 'RATE_LIMITED', message: sent.message } };
        return;
      }
      return ctx.send({ success: true, emailHint: maskEmail(sent.email) });
    } catch (err) {
      strapi.log.error(`2FA email resend fallita: ${err.message}`);
      return ctx.internalServerError('Impossibile inviare il codice via email.');
    }
  },
};
