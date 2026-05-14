'use strict';

/**
 * users-permissions plugin extension.
 *
 * This extension only enriches auth responses with staff context.
 * Registration side effects live in `src/index.js`, where the custom
 * registration middleware can see the original request body and keep the
 * WebsiteConfig creation/rollback flow in one place.
 */

const {
  resolveStaffContext,
  staffUserPayload,
} = require('../../utils/staff-access');
const {
  generateEmailCode,
  hashEmailCode,
  signTwoFactorChallenge,
} = require('../../utils/two-factor-auth');
const {
  setAuthCookies,
  stripJwtFromBodyIfCookieOnly,
} = require('../../utils/auth-cookies');

const TWO_FACTOR_EMAIL_TTL_MS = 10 * 60 * 1000;

function maskEmail(email) {
  const value = String(email || '').trim();
  const [local, domain] = value.split('@');
  if (!local || !domain) return value;
  const visible = local.length <= 2 ? local[0] : `${local.slice(0, 2)}***${local.slice(-1)}`;
  return `${visible}@${domain}`;
}

async function sendLoginEmailCode(user) {
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
    to: user.email,
    subject: 'Codice di accesso ComforTables',
    text: `Il tuo codice di accesso ComforTables e': ${code}\n\nScade tra 10 minuti. Se non hai richiesto tu questo accesso, ignora questa email.`,
    html: `<p>Il tuo codice di accesso ComforTables e':</p><p style="font-size:24px;font-weight:700;letter-spacing:4px;">${code}</p><p>Scade tra 10 minuti. Se non hai richiesto tu questo accesso, ignora questa email.</p>`,
  });
}

module.exports = (plugin) => {
  const originalCallback = plugin.controllers.auth.callback;
  const originalMe = plugin.controllers.user.me;

  async function enrichAuthUser(ctx) {
    const bodyUser = ctx.body && ctx.body.user ? ctx.body.user : null;
    if (!bodyUser || !bodyUser.id) return;

    try {
      const actor = await resolveStaffContext(strapi, bodyUser);
      if (!actor) return;
      Object.assign(ctx.body.user, staffUserPayload(actor.actor, actor.owner));
    } catch (err) {
      strapi.log.warn(`auth user staff enrichment fallita: ${err.message}`);
    }
  }

  plugin.controllers.auth.callback = async (ctx) => {
    await originalCallback(ctx);
    const bodyUser = ctx.body && ctx.body.user ? ctx.body.user : null;
    if (bodyUser?.id && ctx.body?.jwt) {
      const fresh = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { id: bodyUser.id },
        select: ['id', 'email', 'username', 'two_factor_enabled', 'two_factor_method'],
      });

      if (fresh?.two_factor_enabled) {
        const method = fresh.two_factor_method === 'email' ? 'email' : 'totp';
        if (method === 'email') {
          try {
            await sendLoginEmailCode(fresh);
          } catch (err) {
            strapi.log.error(`2FA email login code fallito: ${err.message}`);
            return ctx.internalServerError('Impossibile inviare il codice 2FA via email.');
          }
        }

        ctx.body = {
          two_factor_required: true,
          twoFactorRequired: true,
          challenge_token: signTwoFactorChallenge(strapi, fresh.id, { method }),
          methods: method === 'email' ? ['email'] : ['totp', 'recovery'],
          email_hint: method === 'email' ? maskEmail(fresh.email) : undefined,
          user: {
            id: fresh.id,
            email: fresh.email,
            username: fresh.username,
          },
        };
        return;
      }
    }

    await enrichAuthUser(ctx);
    if (ctx.body?.jwt) {
      setAuthCookies(ctx, ctx.body.jwt);
      stripJwtFromBodyIfCookieOnly(ctx);
    }
  };

  plugin.controllers.user.me = async (ctx) => {
    await originalMe(ctx);
    const bodyUser = ctx.body && ctx.body.id ? ctx.body : null;
    if (!bodyUser) return;
    try {
      const actor = await resolveStaffContext(strapi, bodyUser);
      if (!actor) return;
      Object.assign(ctx.body, staffUserPayload(actor.actor, actor.owner));
    } catch (err) {
      strapi.log.warn(`users/me staff enrichment fallita: ${err.message}`);
    }
  };

  return plugin;
};
