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
    await enrichAuthUser(ctx);
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
