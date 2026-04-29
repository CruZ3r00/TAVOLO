'use strict';

const crypto = require('crypto');
const CAPACITY_MIN = 1;
const CAPACITY_MAX = 10000;

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

function parseCapacity(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function isValidCapacity(value) {
  return Number.isFinite(value) && value >= CAPACITY_MIN && value <= CAPACITY_MAX;
}

async function findUserWebsiteConfig(userId, populate = []) {
  const configs = await strapi.documents('api::website-config.website-config').findMany({
    filters: { fk_user: { id: { $eq: userId } } },
    populate,
  });
  return configs && configs.length > 0 ? configs[0] : null;
}

module.exports = {
  async updateProfile(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const { username, email } = ctx.request.body || {};
    const data = {};
    if (username && username !== user.username) data.username = String(username).trim();
    if (email && email !== user.email) data.email = String(email).trim().toLowerCase();
    if (Object.keys(data).length === 0) return ctx.send({ success: true, user });

    if (data.email) {
      const exists = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { email: data.email, id: { $ne: user.id } },
      });
      if (exists) return ctx.badRequest('Email già in uso');
    }
    if (data.username) {
      const exists = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { username: data.username, id: { $ne: user.id } },
      });
      if (exists) return ctx.badRequest('Username già in uso');
    }

    const updated = await strapi.plugin('users-permissions').service('user').edit(user.id, data);
    const { password, resetPasswordToken, confirmationToken, ...safe } = updated;
    return ctx.send({ success: true, user: safe });
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
       	const siteSlug = String(user.username || '')
  		 .trim()
 		 .replace(/\s+/g, '_');
	const siteUrl = `${siteBaseUrl.replace(/\/+$/, '')}/sites/${siteSlug}`;

  
      `${siteBaseUrl}/sites/${user.username}`;
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

    if (body.logo !== undefined && body.logo !== null && body.logo !== '') {
      data.logo = body.logo;
    }

    const existing = await findUserWebsiteConfig(user.id);
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
    return ctx.send({ success: true, message: 'Account eliminato' });
  },

  async twoFactorStatus(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const fresh = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: user.id },
      select: ['id', 'two_factor_enabled', 'two_factor_secret'],
    });
    return ctx.send({
      enabled: !!fresh?.two_factor_enabled,
      pending: !!fresh?.two_factor_secret && !fresh?.two_factor_enabled,
    });
  },

  async twoFactorEnable(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const secret = generateSecret();
    const recovery = generateRecoveryCodes();
    await strapi.db.query('plugin::users-permissions.user').update({
      where: { id: user.id },
      data: { two_factor_secret: secret, two_factor_enabled: false, two_factor_recovery_codes: recovery },
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

  async twoFactorDisable(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    await strapi.db.query('plugin::users-permissions.user').update({
      where: { id: user.id },
      data: { two_factor_secret: null, two_factor_enabled: false, two_factor_recovery_codes: null },
    });
    return ctx.send({ success: true });
  },

  async twoFactorRegenerateRecovery(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const recovery = generateRecoveryCodes();
    await strapi.db.query('plugin::users-permissions.user').update({
      where: { id: user.id },
      data: { two_factor_recovery_codes: recovery },
    });
    return ctx.send({ recoveryCodes: recovery });
  },
};
