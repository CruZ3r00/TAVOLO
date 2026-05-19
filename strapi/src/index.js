'use strict';

const bcrypt = require('bcryptjs');
const { validateProductionConfig } = require('./utils/production-checks');
const { sweepDueTakeaways } = require('./utils/takeaway-lifecycle');
const { isReservedStaffUsername } = require('./utils/staff-access');
const { setAuthCookies, stripJwtFromBodyIfCookieOnly } = require('./utils/auth-cookies');
const posBridge = require('./services/pos-bridge');
const inventoryAlerts = require('./services/inventory-alerts');
console.log("STARTING STRAPI...");
console.log("PORT:", process.env.PORT);

async function cleanupGeneratedStaffAccounts(strapi, ownerId) {
  if (!ownerId || !strapi.db.connection) return;
  const knex = strapi.db.connection;
  const rows = await knex('restaurant_staff as staff')
    .join('up_users as user', 'user.id', 'staff.user_id')
    .select(['staff.user_id'])
    .where('staff.owner_id', ownerId)
    .whereIn('staff.role', ['cameriere', 'cucina', 'bar', 'pizzeria', 'cucina_sg'])
    .where('user.email', 'like', `staff+${ownerId}.%@staff.local.tavolo`);

  const staffIds = [...new Set((rows || []).map((row) => row.user_id).filter(Boolean))];
  if (staffIds.length === 0) return;

  await knex('restaurant_staff').where('owner_id', ownerId).whereIn('user_id', staffIds).delete();
  if (await knex.schema.hasTable('up_users_fk_owner_lnk')) {
    await knex('up_users_fk_owner_lnk').whereIn('user_id', staffIds).delete();
  }
  if (await knex.schema.hasTable('up_users_role_lnk')) {
    await knex('up_users_role_lnk').whereIn('user_id', staffIds).delete();
  }
  await knex('up_users').whereIn('id', staffIds).delete();
}

async function rollbackCreatedUser(strapi, userId) {
  if (!userId) return;
  try {
    await cleanupGeneratedStaffAccounts(strapi, userId);
  } catch (cleanupStaffErr) {
    strapi.log.warn(`register middleware: cleanup staff rollback fallito per user ${userId}: ${cleanupStaffErr.message}`);
  }
  await strapi.db.query('plugin::users-permissions.user').delete({ where: { id: userId } });
}

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }) {
    // ── Signup metadata capture ──
    // The plugin extension at src/extensions/users-permissions/strapi-server.js
    // doesn't load without a build step (Strapi v5 reads from dist/). Instead,
    // we use a Koa middleware that intercepts POST /api/auth/local/register,
    // captures the custom fields (coperti_invernali, coperti_estivi,
    // restaurant_name), lets the original controller run, then creates
    // the WebsiteConfig atomically.
    strapi.server.use(async (ctx, next) => {
      const isRegister =
        ctx.request.method === 'POST' &&
        ctx.request.path === '/api/auth/local/register';

      if (!isRegister) {
        return next();
      }

      // Body parser hasn't run yet (this middleware is registered before
      // Strapi's middleware stack). Let everything run first.
      await next();

      // Now ctx.request.body is parsed by the body parser and the
      // register controller has already executed.
      const registerResp = ctx.body;
      const createdUser = registerResp && registerResp.user ? registerResp.user : null;
      if (!createdUser || !createdUser.id) {
        return; // registration failed or response isn't a success, nothing to do
      }

      // The custom fields survived in ctx.request.body because the
      // original register only _.pick()s allowedKeys without deleting.
      const body = ctx.request.body || {};
      const rawInv = body.coperti_invernali;
      const rawEst = body.coperti_estivi;
      const rawName = body.restaurant_name;
      const username = String(createdUser.username || '').trim();

      if (isReservedStaffUsername(username)) {
        try {
          await rollbackCreatedUser(strapi, createdUser.id);
        } catch (_) { /* best effort */ }
        ctx.status = 400;
        ctx.body = {
          data: null,
          error: {
            status: 400,
            name: 'ValidationError',
            message: 'Username riservato agli account staff gestiti dal sistema.',
          },
        };
        return;
      }

      // Parse & validate capacity
      const cInv = Number.isFinite(Number(rawInv)) ? parseInt(rawInv, 10) : null;
      if (!cInv || cInv < 1 || cInv > 10000) {
        // Invalid capacity — rollback the created user
        try {
          await rollbackCreatedUser(strapi, createdUser.id);
        } catch (_) { /* best effort */ }
        ctx.status = 400;
        ctx.body = {
          data: null,
          error: { status: 400, name: 'ValidationError', message: 'coperti_invernali obbligatorio (intero 1..10000).' },
        };
        return;
      }

      let cEst = null;
      if (rawEst !== undefined && rawEst !== null && rawEst !== '') {
        cEst = Number.isFinite(Number(rawEst)) ? parseInt(rawEst, 10) : null;
        if (!cEst || cEst < 1 || cEst > 10000) {
          try {
            await rollbackCreatedUser(strapi, createdUser.id);
          } catch (_) { /* best effort */ }
          ctx.status = 400;
          ctx.body = {
            data: null,
            error: { status: 400, name: 'ValidationError', message: 'coperti_estivi non valido (intero 1..10000).' },
          };
          return;
        }
      }
      const copertiEstivi = cEst != null ? cEst : cInv;

      const restaurantName =
        (typeof rawName === 'string' && rawName.trim()) ||
        (typeof createdUser.username === 'string' && createdUser.username.trim()) ||
        'Ristorante';

      try {
        await strapi.db.query('plugin::users-permissions.user').update({
          where: { id: createdUser.id },
          data: {
            signup_restaurant_name: restaurantName,
            signup_coperti_invernali: cInv,
            signup_coperti_estivi: copertiEstivi,
          },
        });
        if (ctx.body && ctx.body.jwt) {
          try {
            setAuthCookies(ctx, ctx.body.jwt);
            stripJwtFromBodyIfCookieOnly(ctx);
          } catch (cookieError) {
            strapi.log.error(
              `register middleware: dati signup salvati per user ${createdUser.username}, ma cookie auth fallito: ${cookieError.message}`
            );
            ctx.status = 500;
            ctx.body = {
              error: {
                code: 'REGISTER_AUTH_COOKIE_FAILED',
                message: 'Registrazione completata, ma accesso automatico non riuscito. Riprova il login.',
              },
            };
          }
        }
      } catch (error) {
        strapi.log.error(
          `register middleware: salvataggio dati signup fallito per user ${createdUser.username}, rollback utente: ${error.message}`
        );
        try {
          await rollbackCreatedUser(strapi, createdUser.id);
        } catch (cleanupErr) {
          strapi.log.error(`register middleware: rollback utente fallito: ${cleanupErr.message}`);
        }
        ctx.status = 500;
        ctx.body = {
          error: {
            code: 'REGISTER_SIGNUP_DATA_FAILED',
            message: 'Registrazione annullata: impossibile salvare i dati del ristorante.',
          },
        };
      }
    });
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }) {
    validateProductionConfig(strapi);
    await configureUsersPermissionsEmail(strapi);
    posBridge.setupWebSocketServer(strapi);

    // Seed data: crea utente demo e dati di test se non esistono
    if (process.env.SEED_DEMO_DATA === 'true') {
      await seedDemoData(strapi);
    }
    // Concede permission alle action custom (menu import, account, ingredient,
    // reservation) per il ruolo Authenticated, e la create pubblica delle
    // prenotazioni per il ruolo Public (usato dal sito vetrina esterno).
    await grantImportPermissions(strapi);
    await grantPublicReservationPermission(strapi);
    startTakeawaySweep(strapi);
    startInventoryAlertsScan(strapi);
  },
};

function startInventoryAlertsScan(strapi) {
  // Scan periodico magazzino (cron 4h). Skip se feature flag disabilitata.
  const enabled = String(process.env.INVENTORY_ALERTS_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    strapi.log.info('Inventory alerts scan disabilitato via INVENTORY_ALERTS_ENABLED=false.');
    return;
  }
  const intervalMs = parseInt(process.env.INVENTORY_ALERTS_INTERVAL_MS || '14400000', 10); // 4h default

  const run = async () => {
    if (strapi.inventoryAlertsScanRunning) return;
    strapi.inventoryAlertsScanRunning = true;
    try {
      await inventoryAlerts.runAlertScan(strapi);
    } catch (err) {
      strapi.log.warn(`inventory-alerts scan fallito: ${err.message}`);
    } finally {
      strapi.inventoryAlertsScanRunning = false;
    }
  };

  // Primo run differito di 2 minuti per non interferire col boot.
  setTimeout(run, 2 * 60 * 1000);
  if (strapi.inventoryAlertsInterval) clearInterval(strapi.inventoryAlertsInterval);
  strapi.inventoryAlertsInterval = setInterval(run, intervalMs);
  if (typeof strapi.inventoryAlertsInterval.unref === 'function') {
    strapi.inventoryAlertsInterval.unref();
  }
  strapi.log.info(`Inventory alerts scan attivo (interval ${Math.round(intervalMs / 60000)}min).`);
}

function startTakeawaySweep(strapi) {
  const run = async () => {
    if (strapi.takeawaySweepRunning) return;
    strapi.takeawaySweepRunning = true;
    try {
      const sent = await sweepDueTakeaways(strapi);
      if (sent > 0) strapi.log.info(`Asporto: inviati ai reparti ${sent} ordini in scadenza.`);
    } catch (err) {
      strapi.log.warn(`Asporto: sweep invio reparti fallito: ${err.message}`);
    } finally {
      strapi.takeawaySweepRunning = false;
    }
  };
  run();
  if (strapi.takeawaySweepInterval) clearInterval(strapi.takeawaySweepInterval);
  strapi.takeawaySweepInterval = setInterval(run, 60000);
  if (typeof strapi.takeawaySweepInterval.unref === 'function') {
    strapi.takeawaySweepInterval.unref();
  }
}

async function configureUsersPermissionsEmail(strapi) {
  try {
    const pluginStore = strapi.store({ type: 'plugin', name: 'users-permissions' });
    const frontendUrl = (process.env.FRONTEND_URL || process.env.SITE_BASE_URL || 'http://localhost:5174').replace(/\/+$/, '');
    const apiUrl = (process.env.PUBLIC_URL || strapi.config.get('server.absoluteUrl') || 'http://localhost:1337').replace(/\/+$/, '');
    const defaultFromRaw = process.env.SMTP_DEFAULT_FROM || 'Tavolo <no-reply@app.comfortables.eu>';
    const replyTo = process.env.SMTP_DEFAULT_REPLY_TO || '';
    const fromMatch = defaultFromRaw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    const from = fromMatch
      ? { name: fromMatch[1] || 'Tavolo', email: fromMatch[2] }
      : { name: 'Tavolo', email: defaultFromRaw };

    const advanced = (await pluginStore.get({ key: 'advanced' })) || {};
    await pluginStore.set({
      key: 'advanced',
      value: {
        ...advanced,
        unique_email: true,
        allow_register: true,
        email_confirmation: false,
        email_reset_password: `${frontendUrl}/reset-password`,
        email_confirmation_redirection: `${frontendUrl}/login?confirmed=1`,
        default_role: advanced.default_role || 'authenticated',
      },
    });

    const emails = (await pluginStore.get({ key: 'email' })) || {};
    await pluginStore.set({
      key: 'email',
      value: {
        ...emails,
        reset_password: {
          ...(emails.reset_password || {}),
          display: 'Email.template.reset_password',
          icon: 'sync',
          options: {
            ...(emails.reset_password && emails.reset_password.options ? emails.reset_password.options : {}),
            from,
            response_email: replyTo,
            object: 'Reimposta la password Tavolo',
            message: `<p>Ciao <%= USER.username %>,</p>

<p>Abbiamo ricevuto una richiesta per reimpostare la password del tuo account Tavolo.</p>

<p><a href="<%= URL %>?code=<%= TOKEN %>">Crea una nuova password</a></p>

<p>Se non hai richiesto tu questa modifica, ignora questa email.</p>

<p>A presto,<br>Team Tavolo</p>`,
          },
        },
        email_confirmation: {
          ...(emails.email_confirmation || {}),
          display: 'Email.template.email_confirmation',
          icon: 'check-square',
          options: {
            ...(emails.email_confirmation && emails.email_confirmation.options ? emails.email_confirmation.options : {}),
            from,
            response_email: replyTo,
            object: 'Conferma il tuo account Tavolo',
            message: `<p>Ciao <%= USER.username %>,</p>

<p>Grazie per esserti registrato a Tavolo. Conferma la tua email per attivare l'account.</p>

<p><a href="<%= URL %>?confirmation=<%= CODE %>">Conferma email</a></p>

<p>A presto,<br>Team Tavolo</p>`,
          },
        },
      },
    });

    strapi.log.info(`Users-permissions email configurate: reset=${frontendUrl}/reset-password, conferma=${apiUrl}/api/auth/email-confirmation`);
  } catch (error) {
    strapi.log.warn(`Configurazione email users-permissions non completata: ${error.message}`);
  }
}

async function grantImportPermissions(strapi) {
  try {
    const role = await strapi.db.query('plugin::users-permissions.role').findOne({
      where: { type: 'authenticated' },
    });
    if (!role) return;

    const actions = [
      'api::menu.menu.list',
      'api::menu.menu.analyzeImport',
      'api::menu.menu.bulkImport',
      'api::element.element.create',
      'api::element.element.update',
      'api::element.element.remove',
      'api::element.element.getRecipe',
      'api::element.element.setRecipe',
      'api::account.account.updateProfile',
      'api::account.account.listStaff',
      'api::account.account.updateStaff',
      'api::account.account.getWebsiteConfig',
      'api::account.account.upsertWebsiteConfig',
      'api::account.account.updatePassword',
      'api::account.account.destroy',
      'api::account.account.twoFactorStatus',
      'api::account.account.twoFactorEnable',
      'api::account.account.twoFactorConfirm',
      'api::account.account.twoFactorEmailEnable',
      'api::account.account.twoFactorEmailConfirm',
      'api::account.account.twoFactorEmailSendCode',
      'api::account.account.twoFactorDisable',
      'api::account.account.twoFactorRegenerateRecovery',
      'api::billing.billing.status',
      'api::billing.billing.createCheckoutSession',
      'api::billing.billing.syncCheckoutSession',
      'api::billing.billing.createPortalSession',
      'api::billing.billing.changePlan',
      'api::billing.billing.cancelSubscription',
      'api::billing.billing.reactivateSubscription',
      'api::billing.billing.abandonSignup',
      'api::ingredient.ingredient.list',
      'api::ingredient.ingredient.toggle',
      'api::ingredient.ingredient.listAdvanced',
      'api::ingredient.ingredient.createAdvanced',
      'api::ingredient.ingredient.restockBatch',
      'api::ingredient.ingredient.updateAdvanced',
      'api::ingredient.ingredient.removeAdvanced',
      'api::ingredient.ingredient.restock',
      'api::ingredient.ingredient.waste',
      'api::ingredient.ingredient.confirmDepleted',
      'api::ingredient.ingredient.listMovements',
      'api::ingredient.ingredient.setAddonConfig',
      'api::ingredient.ingredient.listAddons',
      'api::restock-order.restock-order.create',
      'api::restock-order.restock-order.list',
      'api::restock-order.restock-order.findOne',
      'api::restock-order.restock-order.receive',
      'api::restock-order.restock-order.cancel',
      'api::inventory-alert.inventory-alert.list',
      'api::inventory-alert.inventory-alert.acknowledge',
      'api::bar-shift.bar-shift.getCurrent',
      'api::bar-shift.bar-shift.getCurrentReport',
      'api::bar-shift.bar-shift.openShift',
      'api::bar-shift.bar-shift.caricoFatto',
      'api::bar-shift.bar-shift.getHistory',
      'api::bar-shift.bar-shift.closeShift',
      'api::bar-shift.bar-shift.getReport',
      'api::bar-shift.bar-shift.findOne',
      'api::order-archive.order-archive.history',
      'api::reservation.reservation.createAuthenticated',
      'api::reservation.reservation.list',
      'api::reservation.reservation.updateStatus',
      'api::reservation.reservation.walkin',
      'api::reservation.reservation.seat',
      'api::table.table.list',
      'api::table.table.create',
      'api::table.table.update',
      'api::table.table.remove',
      'api::order.order.create',
      'api::order.order.list',
      'api::order.order.board',
      'api::order.order.sala',
      'api::order.order.findOne',
      'api::order.order.getTotal',
      'api::order.order.addItem',
      'api::order.order.updateItem',
      'api::order.order.deleteItem',
      'api::order.order.updateItemStatus',
      'api::order.order.voidItem',
      'api::order.order.sendDineInToDepartments',
      'api::order.order.close',
      'api::order.order.createTakeawayAuthenticated',
      'api::order.order.updateTakeaway',
      'api::order.order.acceptTakeaway',
      'api::order.order.rejectTakeaway',
      'api::order.order.sendTakeawayToDepartments',
      'api::order.order.pickupTakeaway',
      'api::pos-device.pos-device.register',
      'api::pos-device.pos-device.createPairingToken',
      'api::pos-device.pos-device.revoke',
      'api::pos-device.pos-device.listMine',
      'plugin::upload.content-api.upload',
    ];
    for (const action of actions) {
      const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
        where: { action, role: role.id },
      });
      if (!existing) {
        await strapi.db.query('plugin::users-permissions.permission').create({
          data: { action, role: role.id },
        });
        strapi.log.info(`Permission creata: ${action}`);
      }
    }
  } catch (e) {
    strapi.log.warn('Impossibile concedere permission import: ' + e.message);
  }
}

async function grantPublicReservationPermission(strapi) {
  try {
    const publicRole = await strapi.db.query('plugin::users-permissions.role').findOne({
      where: { type: 'public' },
    });
    if (!publicRole) return;

    const actions = [
      'api::reservation.reservation.createPublic',
      'api::order.order.createTakeawayPublic',
    ];
    for (const action of actions) {
      const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
        where: { action, role: publicRole.id },
      });
      if (!existing) {
        await strapi.db.query('plugin::users-permissions.permission').create({
          data: { action, role: publicRole.id },
        });
        strapi.log.info(`Permission pubblica creata: ${action}`);
      }
    }
  } catch (e) {
    strapi.log.warn('Impossibile concedere permission pubblica reservation: ' + e.message);
  }
}

async function seedDemoData(strapi) {
  try {
    // Controlla se l'utente demo esiste gia'
    const existingUsers = await strapi.db
      .query('plugin::users-permissions.user')
      .findMany({
        where: { email: process.env.DEMO_USER_EMAIL || 'demo@restaurant.com' },
        limit: 1,
      });

    if (existingUsers && existingUsers.length > 0) {
      strapi.log.info('Seed: utente demo gia\' presente, skip seed.');
      return;
    }

    strapi.log.info('Seed: creazione dati demo...');

    // 1. Trova il ruolo "Authenticated"
    const authenticatedRole = await strapi.db
      .query('plugin::users-permissions.role')
      .findOne({
        where: { type: 'authenticated' },
      });

    if (!authenticatedRole) {
      strapi.log.warn('Seed: ruolo authenticated non trovato, skip seed.');
      return;
    }

    const demoEmail = process.env.DEMO_USER_EMAIL || 'demo@restaurant.com';
    const demoPassword = process.env.DEMO_USER_PASSWORD;
    if (!demoPassword) {
      strapi.log.warn('Seed: DEMO_USER_PASSWORD non impostata, skip seed.');
      return;
    }

    // 2. Crea l'utente demo
    const demoUser = await strapi.db
      .query('plugin::users-permissions.user')
      .create({
        data: {
          username: 'demo_restaurant',
          email: demoEmail,
          password: await bcrypt.hash(demoPassword, 10),
          confirmed: true,
          blocked: false,
          role: authenticatedRole.id,
          provider: 'local',
        },
      });

    strapi.log.info(`Seed: utente demo creato (id: ${demoUser.id})`);

    // 3. Crea il website-config per l'utente demo con site_url auto-generato
    const siteBaseUrl = process.env.SITE_BASE_URL || 'http://localhost:1337';
    const demoSiteSlug = publicSiteSlug(demoUser.username);
    const websiteConfig = await strapi.documents('api::website-config.website-config').create({
      data: {
        restaurant_name: 'Ristorante Demo',
        site_url: `${siteBaseUrl.replace(/\/+$/, '')}/sites/${demoSiteSlug}`,
        coperti_invernali: 30,
        coperti_estivi: 60,
        fk_user: { connect: [{ id: demoUser.id }] },
      },
    });

    // Aggiorna l'URL dell'utente demo
    await strapi.db.query('plugin::users-permissions.user').update({
      where: { id: demoUser.id },
      data: { url: `${siteBaseUrl.replace(/\/+$/, '')}/sites/${demoSiteSlug}` },
    });

    strapi.log.info(`Seed: website-config creato (id: ${websiteConfig.id})`);

    // 4. Crea gli elementi demo del menu
    const demoElements = [
      {
        name: 'Margherita',
        price: 6.50,
        category: 'Pizze classiche',
        ingredients: ['Pomodoro', 'Mozzarella', 'Basilico'],
        allergens: ['Glutine', 'Lattosio'],
      },
      {
        name: 'Carbonara',
        price: 10.00,
        category: 'Primi',
        ingredients: ['Spaghetti', 'Guanciale', 'Pecorino', 'Uova', 'Pepe nero'],
        allergens: ['Glutine', 'Uova', 'Lattosio'],
      },
      {
        name: 'Bistecca alla griglia',
        price: 14.00,
        category: 'Secondi',
        ingredients: ['Manzo', 'Sale', 'Rosmarino', 'Olio EVO'],
        allergens: [],
      },
      {
        name: 'Insalata mista',
        price: 5.00,
        category: 'Contorni',
        ingredients: ['Lattuga', 'Pomodori', 'Carote', 'Mais'],
        allergens: [],
      },
      {
        name: 'Tiramisu',
        price: 6.00,
        category: 'Dessert',
        ingredients: ['Mascarpone', 'Savoiardi', 'Caffe', 'Cacao', 'Uova'],
        allergens: ['Glutine', 'Uova', 'Lattosio'],
      },
      {
        name: 'Acqua naturale 1L',
        price: 2.00,
        category: 'Bevande',
        ingredients: [],
        allergens: [],
      },
    ];

    const ingredientsService = require('./services/ingredients');
    const createdElements = [];
    for (const el of demoElements) {
      // Sorgente di verita' per gli ingredienti: relazione ElementIngredient.
      // Il campo legacy `Element.ingredients` JSON non viene piu' scritto.
      const { ingredients: ingredientNames, ...rest } = el;
      const created = await strapi.documents('api::element.element').create({
        data: {
          ...rest,
          fk_user: { connect: [{ id: demoUser.id }] },
        },
        status: 'published',
      });
      try {
        await ingredientsService.syncElementRecipe(strapi, demoUser.id, created.id, ingredientNames || []);
      } catch (recipeErr) {
        strapi.log.warn(`Seed: syncElementRecipe fallita per ${created.documentId}: ${recipeErr.message}`);
      }
      createdElements.push(created);
    }

    strapi.log.info(`Seed: ${createdElements.length} elementi demo creati`);

    // 5. Crea il menu e collega gli elementi
    const menu = await strapi.documents('api::menu.menu').create({
      data: {
        fk_user: { connect: [{ id: demoUser.id }] },
        fk_elements: {
          connect: createdElements.map((el) => ({ documentId: el.documentId })),
        },
      },
      status: 'published',
    });

    strapi.log.info(`Seed: menu demo creato (id: ${menu.id})`);

    // 6. Crea i tavoli demo
    const demoTables = [
      { number: 1, seats: 2, area: 'interno' },
      { number: 2, seats: 4, area: 'interno' },
      { number: 3, seats: 4, area: 'interno' },
      { number: 4, seats: 6, area: 'interno' },
      { number: 5, seats: 4, area: 'esterno' },
    ];

    for (const t of demoTables) {
      await strapi.documents('api::table.table').create({
        data: {
          number: t.number,
          seats: t.seats,
          area: t.area,
          status: 'free',
          fk_user: { connect: [{ id: demoUser.id }] },
        },
      });
    }

    strapi.log.info(`Seed: ${demoTables.length} tavoli demo creati`);
    strapi.log.info('Seed: dati demo creati con successo!');
    strapi.log.info(`Seed: credenziali demo -> email: ${demoEmail}, password da DEMO_USER_PASSWORD`);
  } catch (error) {
    strapi.log.error('Seed: errore durante la creazione dei dati demo:', error);
  }
}
