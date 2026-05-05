'use strict';

/**
 * menu controller
 *
 * Orchestrates public menu retrieval and the OCR import pipeline.
 * The OCR pipeline delegates extraction to an internal Python microservice
 * (see ocr-service/) and never calls external AI providers directly.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createCoreController } = require('@strapi/strapi').factories;

const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

const EXT_BY_MIME = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

const DEFAULT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB
const DEFAULT_OCR_TIMEOUT_MS = 180000; // 180s
const DEFAULT_OCR_SERVICE_URL = 'http://127.0.0.1:8001';
const MAX_BULK_ELEMENTS = 200;

async function ensureCategoryRouting(strapi, ownerId, category) {
  const cleanCategory = typeof category === 'string' ? category.trim() : '';
  if (!ownerId || !cleanCategory || !strapi.db.connection) return;

  try {
    await strapi.db.connection.raw('select public.ensure_restaurant_category_routing(?, ?)', [ownerId, cleanCategory]);
  } catch (err) {
    strapi.log.warn(`menu category routing: sync fallita per user ${ownerId}: ${err.message}`);
  }
}

/**
 * Reduce a string to a filesystem-safe slug.
 */
function slugify(input) {
  if (!input || typeof input !== 'string') return '';
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * Validate that a file buffer starts with the expected magic bytes for the
 * declared MIME type. Returns true if the content matches, false otherwise.
 */
function verifyMagicBytes(buffer, mime) {
  if (!buffer || buffer.length < 4) return false;
  switch (mime) {
    case 'application/pdf':
      return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
    case 'image/png':
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    case 'image/jpeg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/webp':
      if (buffer.length < 12) return false;
      return (
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
      );
    default:
      return false;
  }
}

function getUploadBaseDir() {
  const fromEnv = process.env.MENU_UPLOAD_DIR;
  if (fromEnv && fromEnv.trim()) return path.resolve(fromEnv.trim());
  return path.resolve(strapi.dirs.app.root, '.menu-upload');
}

function getMaxUploadBytes() {
  const raw = parseInt(process.env.MENU_UPLOAD_MAX_BYTES || '', 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_MAX_UPLOAD_BYTES;
}

/**
 * Persist the uploaded file under MENU_UPLOAD_DIR/<restaurant-slug>/<ts>_<rand>.<ext>.
 * Returns the absolute path of the persisted file.
 */
function saveUploadedFile(uploaded, user, restaurantName, mime) {
  const baseDir = getUploadBaseDir();
  const normalizedBase = path.normalize(baseDir);
  const slug = slugify(restaurantName) || `user-${user.id}`;
  const targetDir = path.normalize(path.join(normalizedBase, slug));

  if (!targetDir.startsWith(normalizedBase + path.sep) && targetDir !== normalizedBase) {
    throw new Error('Path traversal detected nel restaurant slug.');
  }

  fs.mkdirSync(targetDir, { recursive: true });

  const originalName = uploaded.originalFilename || uploaded.name || '';
  const declaredExt = path.extname(originalName).toLowerCase();
  const ext = EXT_BY_MIME[mime] || (declaredExt && /^\.[a-z0-9]{1,5}$/.test(declaredExt) ? declaredExt : '');
  if (!ext) {
    throw new Error('Estensione file non determinabile.');
  }

  const safeName = `${Date.now()}_${crypto.randomBytes(2).toString('hex')}${ext}`;
  const targetPath = path.normalize(path.join(targetDir, safeName));

  if (!targetPath.startsWith(normalizedBase + path.sep)) {
    throw new Error('Path traversal detected.');
  }

  const sourcePath = uploaded.filepath || uploaded.path;
  if (!sourcePath) {
    throw new Error('File temporaneo non disponibile.');
  }
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

/**
 * Call the local OCR microservice.
 * Returns `{ data, ok: true }` on success or `{ ok: false, code, message }` on error.
 */
async function callOcrService(filePath, restaurantContext) {
  const baseUrl = (process.env.OCR_SERVICE_URL || DEFAULT_OCR_SERVICE_URL).replace(/\/+$/, '');
  const url = `${baseUrl}/process`;
  const timeoutRaw = parseInt(process.env.OCR_SERVICE_TIMEOUT_MS || '', 10);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_OCR_TIMEOUT_MS;
  const internalToken = process.env.OCR_SERVICE_INTERNAL_TOKEN;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (internalToken && internalToken.trim()) {
      headers['X-Internal-Token'] = internalToken.trim();
    }

    const resp = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        file_path: filePath,
        restaurant_context: restaurantContext,
        options: { ocr_lang: 'it', include_raw: false },
      }),
    });

    let body = null;
    try {
      body = await resp.json();
    } catch (_parseErr) {
      body = null;
    }

    if (resp.status === 503) {
      const code = body && body.code === 'LLM_UNAVAILABLE' ? 'LLM_UNAVAILABLE' : 'OCR_UNAVAILABLE';
      return { ok: false, code: 503, message: (body && body.detail) || 'Servizio OCR/LLM non disponibile.', errorCode: code };
    }
    if (resp.status === 504) {
      return { ok: false, code: 504, message: (body && body.detail) || 'Timeout del servizio OCR.', errorCode: 'OCR_TIMEOUT' };
    }
    if (resp.status === 422) {
      return { ok: false, code: 422, message: (body && body.detail) || 'Analisi completata ma risultato non valido.', errorCode: 'OCR_INVALID_RESULT' };
    }
    if (resp.status === 415) {
      return { ok: false, code: 400, message: (body && body.detail) || 'Formato file non supportato dal servizio OCR.' };
    }
    if (resp.status === 404) {
      return { ok: false, code: 500, message: 'File di upload non trovato dal servizio OCR.' };
    }
    if (resp.status === 403) {
      return { ok: false, code: 500, message: 'Accesso al file non autorizzato dal servizio OCR.' };
    }
    if (!resp.ok) {
      const msg = (body && (body.detail || body.message)) || `Errore OCR (HTTP ${resp.status}).`;
      return { ok: false, code: resp.status >= 400 && resp.status < 600 ? resp.status : 500, message: msg };
    }

    if (!body || !Array.isArray(body.elements)) {
      return { ok: false, code: 502, message: 'Risposta del servizio OCR malformata.' };
    }

    return { ok: true, data: body };
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return { ok: false, code: 504, message: 'Timeout del servizio OCR.', errorCode: 'OCR_TIMEOUT' };
    }
    return { ok: false, code: 503, message: 'Servizio OCR non raggiungibile.', errorCode: 'OCR_UNAVAILABLE' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Strict sanitize + validate a single element coming from the frontend.
 * Returns `{ valid: true, value }` or `{ valid: false, reason }`.
 */
function sanitizeElement(raw) {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, reason: 'Elemento non oggetto.' };
  }
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return { valid: false, reason: 'name mancante.' };
  if (name.length > 200) return { valid: false, reason: 'name troppo lungo.' };

  let price = null;
  if (typeof raw.price === 'number') price = raw.price;
  else if (typeof raw.price === 'string' && raw.price.trim()) {
    const parsed = parseFloat(raw.price.replace(',', '.'));
    price = Number.isFinite(parsed) ? parsed : null;
  }
  if (price == null || !Number.isFinite(price) || price <= 0) {
    return { valid: false, reason: 'price deve essere un numero > 0.' };
  }

  const category = typeof raw.category === 'string' ? raw.category.trim() : '';
  if (!category) return { valid: false, reason: 'category mancante.' };
  if (category.length > 100) return { valid: false, reason: 'category troppo lunga.' };

  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients
        .filter((x) => typeof x === 'string')
        .map((x) => x.trim())
        .filter((x) => x.length > 0)
    : [];
  const allergens = Array.isArray(raw.allergens)
    ? raw.allergens
        .filter((x) => typeof x === 'string')
        .map((x) => x.trim())
        .filter((x) => x.length > 0)
    : [];

  return {
    valid: true,
    value: { name, price, category, ingredients, allergens },
  };
}

function serializeElement(el) {
  if (!el) return null;

  const parsedPrice = Number(el.price);

  return {
    id: el.id,
    documentId: el.documentId,
    name: el.name,
    price: Number.isFinite(parsedPrice) ? parsedPrice : 0,
    category: el.category || '',
    ingredients: Array.isArray(el.ingredients) ? el.ingredients : [],
    allergens: Array.isArray(el.allergens) ? el.allergens : [],
    image: el.image || null,
    available: el.available !== false,
    createdAt: el.createdAt,
    updatedAt: el.updatedAt,
  };
}

function serializeMenu(menu) {
  if (!menu) return null;

  return {
    id: menu.id,
    documentId: menu.documentId,
    fk_elements: Array.isArray(menu.fk_elements)
      ? menu.fk_elements.map(serializeElement)
      : [],
    createdAt: menu.createdAt,
    updatedAt: menu.updatedAt,
  };
}

async function loadPublishedMenuByUserId(strapi, userId) {
  const menus = await strapi.documents('api::menu.menu').findMany({
    filters: {
      fk_user: {
        id: { $eq: userId },
      },
    },
    populate: {
      fk_elements: {
        populate: ['image'],
      },
    },
    status: 'published',
    sort: ['createdAt:asc'],
    limit: 1,
  });

  return Array.isArray(menus) && menus.length > 0 ? menus[0] : null;
}

module.exports = createCoreController('api::menu.menu', ({ strapi }) => ({
  /**
   * GET /api/menus
   * Restituisce il menu del ristoratore autenticato.
   */
  async list(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const menu = await loadPublishedMenuByUserId(strapi, user.id);

      ctx.body = {
        data: menu ? [serializeMenu(menu)] : [],
        meta: { total: menu ? 1 : 0 },
      };
    } catch (error) {
      strapi.log.error('Errore in menu.list:', error);
      return ctx.internalServerError('Errore nel recupero del menu.');
    }
  },

  /**
   * API pubblica: restituisce il menu completo di un ristorante.
   * GET /api/menus/public/:userDocumentId
   * Non richiede autenticazione.
   */
  async publicMenu(ctx) {
    try {
      const { userDocumentId } = ctx.params;

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

      const menu = await loadPublishedMenuByUserId(strapi, user.id);

      if (!menu) {
        return ctx.send({
          data: {
            restaurant_name: websiteConfig ? websiteConfig.restaurant_name : user.username,
            logo_url: null,
            categories: [],
            elements: [],
          },
        });
      }

      const elements = (menu.fk_elements || []).filter((el) => el.available !== false);
      const categories = [...new Set(elements.map((el) => el.category))];
      const formattedElements = elements.map((el) => ({
        documentId: el.documentId,
        name: el.name,
        price: el.price,
        category: el.category,
        ingredients: el.ingredients || [],
        allergens: el.allergens || [],
        available: el.available !== false,
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
   * Riceve un file (PDF o immagine) via multipart e delega l'estrazione al
   * microservizio OCR locale. Restituisce la lista di elementi estratti.
   * Richiede autenticazione.
   */
  async analyzeImport(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    // 1. File presence + MIME whitelist.
    const files = (ctx.request.files) || {};
    const uploaded = files.file || files.files || Object.values(files)[0];
    const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;
    if (!file) return ctx.badRequest('Nessun file caricato.');

    const mime = file.mimetype || file.type;
    if (!ALLOWED_MIME.includes(mime)) {
      return ctx.badRequest(`Tipo file non supportato: ${mime}. Usa PDF, PNG, JPEG o WEBP.`);
    }

    const sourcePath = file.filepath || file.path;
    if (!sourcePath) return ctx.badRequest('File temporaneo non disponibile.');

    // 2. Size + magic bytes.
    let stat;
    try {
      stat = fs.statSync(sourcePath);
    } catch (err) {
      return ctx.badRequest('Impossibile leggere il file caricato.');
    }
    const maxBytes = getMaxUploadBytes();
    if (stat.size > maxBytes) {
      return ctx.badRequest(`File troppo grande. Massimo ${Math.floor(maxBytes / (1024 * 1024))} MB.`);
    }
    if (stat.size === 0) {
      return ctx.badRequest('File vuoto.');
    }

    let buffer;
    try {
      // Legge i primi 16 byte per la verifica magic senza caricare l'intero file in memoria.
      const fd = fs.openSync(sourcePath, 'r');
      buffer = Buffer.alloc(16);
      fs.readSync(fd, buffer, 0, 16, 0);
      fs.closeSync(fd);
    } catch (err) {
      return ctx.badRequest('Impossibile leggere il file caricato.');
    }
    if (!verifyMagicBytes(buffer, mime)) {
      return ctx.badRequest('Il contenuto del file non corrisponde al tipo dichiarato.');
    }

    // 3. Recupera restaurant_name dal website-config dell'utente loggato.
    let restaurantName = `user-${user.id}`;
    try {
      const wc = await strapi.documents('api::website-config.website-config').findMany({
        filters: { fk_user: { id: { $eq: user.id } } },
        limit: 1,
      });
      if (wc && wc.length > 0 && wc[0].restaurant_name && wc[0].restaurant_name.trim()) {
        restaurantName = wc[0].restaurant_name.trim();
      }
    } catch (err) {
      strapi.log.warn('analyzeImport: website-config lookup failed, fallback a user-<id>:', err.message);
    }

    // 4. Persisti file su disco.
    let savedPath;
    try {
      savedPath = saveUploadedFile(file, user, restaurantName, mime);
    } catch (err) {
      strapi.log.error('analyzeImport: errore salvataggio file:', err);
      return ctx.internalServerError('Impossibile salvare il file di upload.');
    }

    // 5. Chiama il microservizio OCR.
    const ocrResp = await callOcrService(savedPath, {
      restaurant_name: restaurantName,
      cuisine_hint: 'italiana',
    });

    if (!ocrResp.ok) {
      const body = { error: { message: ocrResp.message } };
      if (ocrResp.errorCode) body.error.code = ocrResp.errorCode;
      ctx.status = ocrResp.code;
      return ctx.send(body);
    }

    const result = ocrResp.data;

    if (!Array.isArray(result.elements) || result.elements.length === 0) {
      ctx.status = 422;
      return ctx.send({
        error: {
          message: 'Nessun piatto riconosciuto nel documento.',
          ocr_confidence: typeof result.ocr_confidence === 'number' ? result.ocr_confidence : null,
        },
      });
    }

    // 6. Annotazione _missing per il frontend.
    const annotated = result.elements.map((el) => {
      const ingredients = Array.isArray(el.ingredients) ? el.ingredients : [];
      const allergens = Array.isArray(el.allergens) ? el.allergens : [];
      return {
        name: typeof el.name === 'string' ? el.name : '',
        price: typeof el.price === 'number' ? el.price : (el.price == null ? null : null),
        category: typeof el.category === 'string' ? el.category : '',
        ingredients,
        allergens,
        image_coords: el.image_coords || null,
        _missing: {
          name: !el.name,
          price: el.price == null,
          category: !el.category,
          ingredients: ingredients.length === 0,
          allergens: allergens.length === 0,
        },
      };
    });

    const baseDir = getUploadBaseDir();
    const relativeSource = path.relative(baseDir, savedPath);

    return ctx.send({
      data: {
        elements: annotated,
        count: annotated.length,
        ocr_confidence: typeof result.ocr_confidence === 'number' ? result.ocr_confidence : null,
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
        source_file: relativeSource,
      },
    });
  },

  /**
   * POST /api/menus/import/bulk
   * Body: { mode?: "append"|"replace", elements: [...] }
   * - append  : crea gli elementi e li collega al menu utente (default).
   * - replace : sostituisce atomicamente gli elementi esistenti.
   * Richiede autenticazione. Wrappato in una transazione Knex.
   */
  async bulkImport(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    const body = ctx.request.body || {};
    const mode = body.mode || 'append';
    const rawElements = body.elements;

    if (!['append', 'replace'].includes(mode)) {
      return ctx.badRequest('mode non valido: usare "append" o "replace".');
    }
    if (!Array.isArray(rawElements) || rawElements.length === 0) {
      return ctx.badRequest('elements: deve essere un array non vuoto.');
    }
    if (rawElements.length > MAX_BULK_ELEMENTS) {
      return ctx.badRequest(`elements: massimo ${MAX_BULK_ELEMENTS} elementi per richiesta.`);
    }

    // Validazione upfront di tutti gli elementi. Nessun side effect se qualcuno fallisce.
    const cleaned = [];
    for (let i = 0; i < rawElements.length; i += 1) {
      const res = sanitizeElement(rawElements[i]);
      if (!res.valid) {
        return ctx.badRequest(`Elemento #${i + 1} non valido: ${res.reason}`);
      }
      cleaned.push(res.value);
    }

    try {
      const txResult = await strapi.db.transaction(async () => {
        const existingMenus = await strapi.documents('api::menu.menu').findMany({
          filters: { fk_user: { id: { $eq: user.id } } },
          populate: { fk_elements: true },
        });
        const menu = existingMenus && existingMenus.length > 0 ? existingMenus[0] : null;

        const createdDocs = [];
        for (const el of cleaned) {
          const doc = await strapi.documents('api::element.element').create({
            data: {
              name: el.name,
              price: el.price,
              category: el.category,
              ingredients: el.ingredients,
              allergens: el.allergens,
              fk_user: { connect: [{ id: user.id }] },
            },
            status: 'published',
          });
          await ensureCategoryRouting(strapi, user.id, el.category);
          createdDocs.push(doc);
        }

        const createdConn = createdDocs.map((c) => ({ documentId: c.documentId }));

        if (mode === 'replace') {
          if (menu) {
            const oldElements = Array.isArray(menu.fk_elements) ? menu.fk_elements : [];
            const oldDocIds = oldElements.map((e) => e.documentId).filter(Boolean);

            await strapi.documents('api::menu.menu').update({
              documentId: menu.documentId,
              data: { fk_elements: { set: createdConn } },
              status: 'published',
            });

            for (const oid of oldDocIds) {
              await strapi.documents('api::element.element').delete({ documentId: oid });
            }

            return { created_count: createdDocs.length, deleted_count: oldDocIds.length };
          }

          // Nessun menu esistente: replace = creazione nuovo menu.
          await strapi.documents('api::menu.menu').create({
            data: {
              fk_user: { connect: [{ id: user.id }] },
              fk_elements: { connect: createdConn },
            },
            status: 'published',
          });
          return { created_count: createdDocs.length, deleted_count: 0 };
        }

        // mode === 'append'
        if (menu) {
          const existingConn = (Array.isArray(menu.fk_elements) ? menu.fk_elements : [])
            .map((e) => ({ documentId: e.documentId }))
            .filter((c) => c.documentId);
          await strapi.documents('api::menu.menu').update({
            documentId: menu.documentId,
            data: { fk_elements: { connect: [...existingConn, ...createdConn] } },
            status: 'published',
          });
        } else {
          await strapi.documents('api::menu.menu').create({
            data: {
              fk_user: { connect: [{ id: user.id }] },
              fk_elements: { connect: createdConn },
            },
            status: 'published',
          });
        }
        return { created_count: createdDocs.length, deleted_count: 0 };
      });

      return ctx.send({
        data: {
          mode,
          created_count: txResult.created_count,
          deleted_count: txResult.deleted_count,
          failed_count: 0,
          failed: [],
        },
      });
    } catch (error) {
      strapi.log.error('bulkImport: rollback transazione:', error);
      return ctx.internalServerError('Operazione annullata, menu invariato.');
    }
  },
}));
