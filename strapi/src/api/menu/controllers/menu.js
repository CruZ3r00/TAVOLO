'use strict';

/**
 * menu controller
 */

const fs = require('fs');
const { createCoreController } = require('@strapi/strapi').factories;

const EXTRACTION_PROMPT = `Sei un assistente che analizza menu di ristoranti (in italiano). Analizza il documento allegato ed estrai TUTTI i piatti/bevande che riesci a identificare. Per ogni elemento restituisci un oggetto con:
- name: nome del piatto (string, obbligatorio se identificabile)
- price: prezzo numerico in euro (number, null se non visibile)
- category: categoria (es. "Primi", "Secondi", "Pizze", "Dessert", "Bevande", "Antipasti", "Contorni"). Se il menu ha sezioni, usa il titolo della sezione. null se non deducibile.
- ingredients: array di stringhe con gli ingredienti elencati. [] se non specificati.
- allergens: array di stringhe con allergeni elencati/dedotti dagli ingredienti comuni (glutine, lattosio, uova, frutta a guscio, ecc.). [] se nessuno.

Rispondi SOLO con JSON valido nel formato:
{"elements": [ {...}, {...} ]}
Non includere testo fuori dal JSON. Non inventare prezzi o ingredienti: se mancano, usa null/array vuoto.`;

async function callClaudeExtract(fileBuffer, mime) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY non configurata nel file .env di Strapi.');

  const base64 = fileBuffer.toString('base64');
  const isPdf = mime === 'application/pdf';
  const sourceBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } };

  const body = {
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [sourceBlock, { type: 'text', text: EXTRACTION_PROMPT }],
      },
    ],
  };

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Claude API error (${resp.status}): ${err}`);
  }
  const data = await resp.json();
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();

  // Estrai il primo blocco JSON valido
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Risposta del modello non contiene JSON.');
  const parsed = JSON.parse(match[0]);
  const list = Array.isArray(parsed.elements) ? parsed.elements : [];

  return list.map((el) => ({
    name: typeof el.name === 'string' ? el.name.trim() : '',
    price: typeof el.price === 'number' ? el.price : (el.price != null && !isNaN(parseFloat(el.price)) ? parseFloat(el.price) : null),
    category: typeof el.category === 'string' ? el.category.trim() : '',
    ingredients: Array.isArray(el.ingredients) ? el.ingredients.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : [],
    allergens: Array.isArray(el.allergens) ? el.allergens.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : [],
  }));
}

module.exports = createCoreController('api::menu.menu', ({ strapi }) => ({
  /**
   * API pubblica: restituisce il menu completo di un ristorante
   * GET /api/menus/public/:userDocumentId
   * Non richiede autenticazione.
   */
  async publicMenu(ctx) {
    try {
      const { userDocumentId } = ctx.params;

      // 1. Trova l'utente tramite documentId
      const users = await strapi.db
        .query('plugin::users-permissions.user')
        .findMany({
          where: { documentId: userDocumentId },
          limit: 1,
        });

      if (!users || users.length === 0) {
        return ctx.notFound('Ristorante non trovato');
      }

      const user = users[0];

      // 2. Trova il website-config dell'utente
      const websiteConfigs = await strapi.documents('api::website-config.website-config').findMany({
        filters: {
          fk_user: {
            id: { $eq: user.id },
          },
        },
        populate: ['logo'],
      });

      const websiteConfig = websiteConfigs && websiteConfigs.length > 0
        ? websiteConfigs[0]
        : null;

      // 3. Trova il menu dell'utente con gli elementi
      const menus = await strapi.documents('api::menu.menu').findMany({
        filters: {
          fk_user: {
            id: { $eq: user.id },
          },
        },
        populate: {
          fk_elements: {
            populate: ['image'],
          },
        },
      });

      if (!menus || menus.length === 0) {
        return ctx.send({
          data: {
            restaurant_name: websiteConfig ? websiteConfig.restaurant_name : user.username,
            logo_url: null,
            categories: [],
            elements: [],
          },
        });
      }

      const menu = menus[0];
      const elements = menu.fk_elements || [];

      // 4. Estrai le categorie uniche
      const categories = [...new Set(elements.map((el) => el.category))];

      // 5. Formatta la risposta
      const formattedElements = elements.map((el) => ({
        documentId: el.documentId,
        name: el.name,
        price: el.price,
        category: el.category,
        ingredients: el.ingredients || [],
        allergens: el.allergens || [],
        image_url: el.image
          ? el.image.formats && el.image.formats.thumbnail
            ? el.image.formats.thumbnail.url
            : el.image.url
          : null,
        image_full_url: el.image ? el.image.url : null,
      }));

      return ctx.send({
        data: {
          restaurant_name: websiteConfig ? websiteConfig.restaurant_name : user.username,
          logo_url: websiteConfig && websiteConfig.logo
            ? websiteConfig.logo.url
            : null,
          categories,
          elements: formattedElements,
        },
      });
    } catch (error) {
      strapi.log.error('Errore in publicMenu:', error);
      return ctx.internalServerError('Errore nel recupero del menu');
    }
  },

  /**
   * POST /api/menus/import/analyze
   * Riceve un file (PDF o immagine) via multipart e restituisce la lista di elementi estratti.
   * Richiede autenticazione.
   */
  async analyzeImport(ctx) {
    try {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized('Autenticazione richiesta.');

      const files = ctx.request.files || {};
      const file = files.file || files.files || Object.values(files)[0];
      const uploaded = Array.isArray(file) ? file[0] : file;
      if (!uploaded) return ctx.badRequest('Nessun file caricato.');

      const mime = uploaded.mimetype || uploaded.type;
      const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];
      if (!allowed.includes(mime)) {
        return ctx.badRequest(`Tipo file non supportato: ${mime}. Usa PDF o immagine (PNG/JPEG/WEBP/GIF).`);
      }

      const filePath = uploaded.filepath || uploaded.path;
      const buffer = fs.readFileSync(filePath);

      const elements = await callClaudeExtract(buffer, mime);

      // Annota i campi mancanti per il frontend (warning non bloccanti)
      const annotated = elements.map((el) => ({
        ...el,
        _missing: {
          name: !el.name,
          price: el.price == null,
          category: !el.category,
          ingredients: !el.ingredients || el.ingredients.length === 0,
          allergens: !el.allergens || el.allergens.length === 0,
        },
      }));

      return ctx.send({ data: { elements: annotated, count: annotated.length } });
    } catch (error) {
      strapi.log.error('Errore in analyzeImport:', error);
      return ctx.internalServerError(error.message || 'Errore durante l\'analisi del documento.');
    }
  },

  /**
   * POST /api/menus/import/bulk
   * Body: { elements: [{ name, price, category, ingredients, allergens }] }
   * Crea ogni elemento e lo collega al menu dell'utente (creandolo se non esiste).
   */
  async bulkImport(ctx) {
    try {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized('Autenticazione richiesta.');

      const { elements } = ctx.request.body || {};
      if (!Array.isArray(elements) || elements.length === 0) {
        return ctx.badRequest('Lista elementi vuota o non valida.');
      }

      const created = [];
      const failed = [];

      for (const el of elements) {
        try {
          if (!el.name || el.price == null || !el.category) {
            failed.push({ element: el, reason: 'Campi obbligatori mancanti (name, price, category).' });
            continue;
          }
          const doc = await strapi.documents('api::element.element').create({
            data: {
              name: String(el.name).trim(),
              price: parseFloat(el.price),
              category: String(el.category).trim(),
              ingredients: Array.isArray(el.ingredients) ? el.ingredients : [],
              allergens: Array.isArray(el.allergens) ? el.allergens : [],
            },
            status: 'published',
          });
          created.push(doc);
        } catch (e) {
          strapi.log.warn('bulkImport: fallita creazione elemento', e.message);
          failed.push({ element: el, reason: e.message });
        }
      }

      if (created.length > 0) {
        // Trova o crea il menu dell'utente e collega gli elementi
        const existing = await strapi.documents('api::menu.menu').findMany({
          filters: { fk_user: { id: { $eq: user.id } } },
          populate: { fk_elements: true },
        });

        if (!existing || existing.length === 0) {
          await strapi.documents('api::menu.menu').create({
            data: {
              fk_user: { connect: [{ id: user.id }] },
              fk_elements: { connect: created.map((c) => ({ documentId: c.documentId })) },
            },
            status: 'published',
          });
        } else {
          const menu = existing[0];
          const existingIds = (menu.fk_elements || []).map((e) => ({ documentId: e.documentId }));
          const newConnect = [...existingIds, ...created.map((c) => ({ documentId: c.documentId }))];
          await strapi.documents('api::menu.menu').update({
            documentId: menu.documentId,
            data: { fk_elements: { connect: newConnect } },
          });
        }
      }

      return ctx.send({
        data: {
          created_count: created.length,
          failed_count: failed.length,
          failed,
        },
      });
    } catch (error) {
      strapi.log.error('Errore in bulkImport:', error);
      return ctx.internalServerError('Errore durante l\'import.');
    }
  },
}));
