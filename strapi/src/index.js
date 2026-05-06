'use strict';

const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { validateProductionConfig } = require('./utils/production-checks');
const { sweepDueTakeaways } = require('./utils/takeaway-lifecycle');
console.log("STARTING STRAPI...");
console.log("PORT:", process.env.PORT);
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }) {
    // ── WebsiteConfig creation on registration ──
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

      // Parse & validate capacity
      const cInv = Number.isFinite(Number(rawInv)) ? parseInt(rawInv, 10) : null;
      if (!cInv || cInv < 1 || cInv > 10000) {
        // Invalid capacity — rollback the created user
        try {
          await strapi.db.query('plugin::users-permissions.user').delete({ where: { id: createdUser.id } });
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
            await strapi.db.query('plugin::users-permissions.user').delete({ where: { id: createdUser.id } });
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
        if (strapi.db.connection) {
          try {
            await strapi.db.connection.raw('select public.sync_owner_staff_accounts(?)', [createdUser.id]);
          } catch (syncErr) {
            strapi.log.warn(`register middleware: sync staff DB fallita per user ${createdUser.id}: ${syncErr.message}`);
          }
        }
        if (ctx.body && ctx.body.user) {
          ctx.body.user.url = siteUrl;
        }
      } catch (error) {
        strapi.log.error(
          `register middleware: creazione WebsiteConfig fallita per user ${createdUser.username}, rollback utente: ${error.message}`
        );
        try {
          await strapi.db
            .query('plugin::users-permissions.user')
            .delete({ where: { id: createdUser.id } });
        } catch (cleanupErr) {
          strapi.log.error(`register middleware: rollback utente fallito: ${cleanupErr.message}`);
        }
        ctx.status = 500;
        ctx.body = {
          error: {
            code: 'REGISTER_CAPACITY_FAILED',
            message: 'Registrazione annullata: impossibile configurare la capacità del ristorante.',
          },
        };
      }
    });

    // Lifecycle hook: invia email di notifica quando un nuovo utente si registra
    strapi.db.lifecycles.subscribe({
      models: ['plugin::users-permissions.user'],
      async afterCreate(event) {
        const { result } = event;
        if (result && result.staff_role && result.staff_role !== 'owner') {
          strapi.log.info(`Staff user creato (${result.staff_role}), skip sito/email: ${result.username}`);
          return;
        }

        // Genera il file HTML del sito in restaurant-sites/
        try {
          const sitesDir = path.resolve(strapi.dirs.app.root, '..', 'restaurant-sites');
          if (!fs.existsSync(sitesDir)) {
            fs.mkdirSync(sitesDir, { recursive: true });
          }
          const safeUsername = escapeHtml(result.username);
          const filePath = path.join(sitesDir, `${result.username}.html`);
          const htmlContent = `<!DOCTYPE html>
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
          fs.writeFileSync(filePath, htmlContent, 'utf-8');
          strapi.log.info(`Sito placeholder creato per ${result.username}: ${filePath}`);
        } catch (fileError) {
          strapi.log.warn(`Impossibile creare il file sito per ${result.username}: ${fileError.message}`);
        }

        try {
          const notificationEmail = process.env.NEW_USER_NOTIFICATION_EMAIL || '';
          const siteBaseUrl = process.env.SITE_BASE_URL || 'http://localhost:1337';

          if (!notificationEmail) {
            strapi.log.info('Email di notifica nuovo utente non configurata, skip.');
            return;
          }

          await strapi.plugin('email').service('email').send({
            to: notificationEmail,
            from: process.env.SMTP_DEFAULT_FROM || 'no-reply@example.com',
            subject: `Nuovo ristoratore registrato: ${result.username}`,
            text: [
              'Un nuovo ristoratore si e\' registrato sul CMS!',
              '',
              '--- Informazioni ---',
              `Username: ${result.username}`,
              `Email: ${result.email}`,
              `Nome: ${result.name || 'Non specificato'}`,
              `Cognome: ${result.surname || 'Non specificato'}`,
              `Data registrazione: ${new Date().toLocaleString('it-IT')}`,
              '',
              `Pannello admin: ${siteBaseUrl}/admin`,
              '',
              '---',
              'CMS Restaurant - Notifica automatica',
            ].join('\n'),
            html: `
              <h2>Nuovo ristoratore registrato</h2>
              <p>Un nuovo ristoratore si e' registrato sul CMS!</p>
              <table style="border-collapse:collapse;width:100%;max-width:500px;">
                <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Username</td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(result.username)}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Email</td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(result.email)}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Nome</td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(result.name || 'Non specificato')}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Cognome</td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(result.surname || 'Non specificato')}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Data registrazione</td><td style="padding:8px;border:1px solid #ddd;">${new Date().toLocaleString('it-IT')}</td></tr>
              </table>
              <p style="margin-top:20px;"><a href="${siteBaseUrl}/admin">Vai al pannello admin</a></p>
              <hr><p style="color:#999;font-size:12px;">CMS Restaurant - Notifica automatica</p>
            `,
          });
          strapi.log.info(`Email di notifica inviata per nuovo utente: ${result.username}`);
        } catch (error) {
          // Non bloccare la registrazione se l'email fallisce
          strapi.log.warn(`Impossibile inviare email di notifica per ${result.username}: ${error.message}`);
        }
      },
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
  },
};

function startTakeawaySweep(strapi) {
  const run = async () => {
    try {
      const sent = await sweepDueTakeaways(strapi);
      if (sent > 0) strapi.log.info(`Asporto: inviati ai reparti ${sent} ordini in scadenza.`);
    } catch (err) {
      strapi.log.warn(`Asporto: sweep invio reparti fallito: ${err.message}`);
    }
  };
  run();
  if (strapi.takeawaySweepInterval) clearInterval(strapi.takeawaySweepInterval);
  strapi.takeawaySweepInterval = setInterval(run, 60000);
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
      'api::account.account.twoFactorDisable',
      'api::account.account.twoFactorRegenerateRecovery',
      'api::ingredient.ingredient.list',
      'api::ingredient.ingredient.toggle',
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
      'api::order.order.findOne',
      'api::order.order.getTotal',
      'api::order.order.addItem',
      'api::order.order.updateItem',
      'api::order.order.deleteItem',
      'api::order.order.updateItemStatus',
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
    const websiteConfig = await strapi.documents('api::website-config.website-config').create({
      data: {
        restaurant_name: 'Ristorante Demo',
        site_url: `${siteBaseUrl}/sites/${demoUser.username}`,
        coperti_invernali: 30,
        coperti_estivi: 60,
        fk_user: { connect: [{ id: demoUser.id }] },
      },
    });

    // Aggiorna l'URL dell'utente demo
    await strapi.db.query('plugin::users-permissions.user').update({
      where: { id: demoUser.id },
      data: { url: `${siteBaseUrl}/sites/${demoUser.username}` },
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

    const createdElements = [];
    for (const el of demoElements) {
      const created = await strapi.documents('api::element.element').create({
        data: {
          ...el,
          fk_user: { connect: [{ id: demoUser.id }] },
        },
        status: 'published',
      });
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
