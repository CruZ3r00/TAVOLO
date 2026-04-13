'use strict';

const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }) {
    // Lifecycle hook: invia email di notifica quando un nuovo utente si registra
    strapi.db.lifecycles.subscribe({
      models: ['plugin::users-permissions.user'],
      async afterCreate(event) {
        const { result } = event;

        // Genera il file HTML del sito in restaurant-sites/
        try {
          const sitesDir = path.resolve(strapi.dirs.app.root, '..', 'restaurant-sites');
          if (!fs.existsSync(sitesDir)) {
            fs.mkdirSync(sitesDir, { recursive: true });
          }
          const filePath = path.join(sitesDir, `${result.username}.html`);
          const htmlContent = `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${result.username} - Sito in costruzione</title>
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
        <p class="text-muted mb-4">Il sito menu di <strong>${result.username}</strong> è in fase di preparazione. Torna a trovarci presto!</p>
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
          const notificationEmail = 'site.alerts@outlook.com';
          const siteBaseUrl = process.env.SITE_BASE_URL || 'http://localhost:1337';

          await strapi.plugin('email').service('email').send({
            to: 'site.alerts@outlook.com',
            from:  'a7e207001@smtp-brevo.com',
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
                <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Username</td><td style="padding:8px;border:1px solid #ddd;">${result.username}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Email</td><td style="padding:8px;border:1px solid #ddd;">${result.email}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Nome</td><td style="padding:8px;border:1px solid #ddd;">${result.name || 'Non specificato'}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Cognome</td><td style="padding:8px;border:1px solid #ddd;">${result.surname || 'Non specificato'}</td></tr>
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
    // Seed data: crea utente demo e dati di test se non esistono
    await seedDemoData(strapi);
    // Concede permission alle action custom di import menu per il ruolo Authenticated
    await grantImportPermissions(strapi);
  },
};

async function grantImportPermissions(strapi) {
  try {
    const role = await strapi.db.query('plugin::users-permissions.role').findOne({
      where: { type: 'authenticated' },
    });
    if (!role) return;

    const actions = [
      'api::menu.menu.analyzeImport',
      'api::menu.menu.bulkImport',
      'api::account.account.updateProfile',
      'api::account.account.updatePassword',
      'api::account.account.destroy',
      'api::account.account.twoFactorStatus',
      'api::account.account.twoFactorEnable',
      'api::account.account.twoFactorConfirm',
      'api::account.account.twoFactorDisable',
      'api::account.account.twoFactorRegenerateRecovery',
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

async function seedDemoData(strapi) {
  try {
    // Controlla se l'utente demo esiste gia'
    const existingUsers = await strapi.db
      .query('plugin::users-permissions.user')
      .findMany({
        where: { email: 'demo@restaurant.com' },
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

    // 2. Crea l'utente demo
    const demoUser = await strapi.db
      .query('plugin::users-permissions.user')
      .create({
        data: {
          username: 'demo_restaurant',
          email: 'demo@restaurant.com',
          password: await bcrypt.hash('DemoPass123!', 10),
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
        data: el,
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
    strapi.log.info('Seed: dati demo creati con successo!');
    strapi.log.info('Seed: credenziali demo -> email: demo@restaurant.com, password: DemoPass123!');
  } catch (error) {
    strapi.log.error('Seed: errore durante la creazione dei dati demo:', error);
  }
}
