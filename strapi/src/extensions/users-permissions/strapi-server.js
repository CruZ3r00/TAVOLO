'use strict';

/**
 * users-permissions plugin extension.
 *
 * Override di `auth.register` per validare e persistere i campi di
 * capacità del ristorante (`coperti_invernali`, `coperti_estivi`) nello
 * stesso flusso di registrazione.
 *
 * Flusso atomico:
 *  1. valida i coperti ricevuti dal body;
 *  2. invoca il register originale (crea l'utente);
 *  3. nella stessa richiesta crea la WebsiteConfig con i coperti e con
 *     il fallback `coperti_estivi ?? coperti_invernali`;
 *  4. se la WebsiteConfig non può essere creata, l'utente creato viene
 *     eliminato per evitare account senza capacità configurata.
 *
 * Il lifecycle `afterCreate` in `strapi/src/index.js` mantiene gli effetti
 * collaterali non critici (creazione HTML placeholder, notifica email) e
 * NON crea più il record WebsiteConfig: la responsabilità è qui.
 *
 * Vedi ADR-0001.7.
 */

const CAPACITY_MIN = 1;
const CAPACITY_MAX = 10000;

function parseCapacity(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function isValidCapacity(value) {
  return Number.isFinite(value) && value >= CAPACITY_MIN && value <= CAPACITY_MAX;
}

module.exports = (plugin) => {
  const originalRegister = plugin.controllers.auth.register;

  plugin.controllers.auth.register = async (ctx) => {
    const body = ctx.request.body || {};

    const cInv = parseCapacity(body.coperti_invernali);
    if (!isValidCapacity(cInv)) {
      return ctx.badRequest('coperti_invernali obbligatorio (intero 1..10000).');
    }

    let cEst = null;
    if (body.coperti_estivi !== undefined && body.coperti_estivi !== null && body.coperti_estivi !== '') {
      cEst = parseCapacity(body.coperti_estivi);
      if (!isValidCapacity(cEst)) {
        return ctx.badRequest('coperti_estivi non valido (intero 1..10000).');
      }
    }
    const copertiEstivi = cEst != null ? cEst : cInv;

    const restaurantNameRaw = typeof body.restaurant_name === 'string' ? body.restaurant_name.trim() : '';
    const restaurantName = restaurantNameRaw || (typeof body.username === 'string' ? body.username.trim() : '') || 'Ristorante';

    // Rimuovi i campi custom dal body perché `originalRegister` valida
    // lo schema users-permissions e potrebbe rifiutare campi sconosciuti.
    delete ctx.request.body.coperti_invernali;
    delete ctx.request.body.coperti_estivi;
    delete ctx.request.body.restaurant_name;

    await originalRegister(ctx);

    const registerResp = ctx.body;
    const createdUser = registerResp && registerResp.user ? registerResp.user : null;
    if (!createdUser || !createdUser.id) {
      return;
    }

    try {
      const siteBaseUrl = process.env.SITE_BASE_URL || 'http://localhost:1337';
      const siteUrl = `${siteBaseUrl}/sites/${createdUser.username}`;
      await strapi.documents('api::website-config.website-config').create({
        data: {
          restaurant_name: restaurantName,
          site_url: siteUrl,
          coperti_invernali: cInv,
          coperti_estivi: copertiEstivi,
          fk_user: { connect: [{ id: createdUser.id }] },
        },
      });
      await strapi.db.query('plugin::users-permissions.user').update({
        where: { id: createdUser.id },
        data: { url: siteUrl },
      });
      if (ctx.body && ctx.body.user) {
        ctx.body.user.url = siteUrl;
      }
    } catch (error) {
      strapi.log.error(
        `register: creazione WebsiteConfig fallita per user ${createdUser.username}, rollback utente: ${error.message}`
      );
      try {
        await strapi.db.query('plugin::users-permissions.user').delete({ where: { id: createdUser.id } });
      } catch (cleanupErr) {
        strapi.log.error(`register: rollback utente fallito: ${cleanupErr.message}`);
      }
      ctx.status = 500;
      ctx.body = {
        error: {
          code: 'REGISTER_CAPACITY_FAILED',
          message: 'Registrazione annullata: impossibile configurare la capacità del ristorante.',
        },
      };
    }
  };

  return plugin;
};
