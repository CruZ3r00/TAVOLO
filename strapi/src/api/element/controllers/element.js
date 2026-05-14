'use strict';

/**
 * element controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { ensureCategoryRouting, isBarRoutedCategory } = require('../../../utils/category-routing');
const ingredientsService = require('../../../services/ingredients');

const trimString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeStringArray = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseImageId = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'object' && value !== null && value.id !== undefined) {
    return parseImageId(value.id);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
};

function buildElementData(raw, { partial = false } = {}) {
  const data = {};

  if (raw.name !== undefined || !partial) {
    const name = trimString(raw.name);
    if (!name) return { ok: false, message: 'Nome obbligatorio.' };
    data.name = name;
  }

  if (raw.price !== undefined || !partial) {
    const price = Number(raw.price);
    if (!Number.isFinite(price) || price <= 0) {
      return { ok: false, message: 'Prezzo non valido.' };
    }
    data.price = price;
  }

  if (raw.category !== undefined || !partial) {
    const category = trimString(raw.category);
    if (!category) return { ok: false, message: 'Categoria obbligatoria.' };
    data.category = category;
  }

  if (raw.ingredients !== undefined || !partial) {
    data.ingredients = normalizeStringArray(raw.ingredients);
  }

  if (raw.allergens !== undefined || !partial) {
    data.allergens = normalizeStringArray(raw.allergens);
  }

  if (raw.image !== undefined) {
    data.image = parseImageId(raw.image);
  }

  // Flag bevanda: se il client lo passa esplicito, rispettiamo il valore.
  // Se invece e' undefined, il controller (create/update) lo calcola dopo
  // aver garantito la category_routing — cosi' rispecchia sempre il routing
  // staff "bar" (override pro o regex fallback).
  if (raw.is_beverage !== undefined) {
    data.is_beverage = !!raw.is_beverage;
  }
  if (raw.is_beverage_advanced !== undefined) {
    data.is_beverage_advanced = !!raw.is_beverage_advanced;
  }
  if (raw.is_archived !== undefined) {
    data.is_archived = !!raw.is_archived;
  }

  if (partial && Object.keys(data).length === 0) {
    return { ok: false, message: 'Nessun campo da aggiornare.' };
  }

  return { ok: true, data };
}

function serializeElement(element) {
  if (!element) return null;

  const parsedPrice = Number(element.price);

  return {
    id: element.id,
    documentId: element.documentId,
    name: element.name,
    price: Number.isFinite(parsedPrice) ? parsedPrice : 0,
    category: element.category || '',
    ingredients: Array.isArray(element.ingredients) ? element.ingredients : [],
    allergens: Array.isArray(element.allergens) ? element.allergens : [],
    image: element.image || null,
    available: element.available !== false,
    is_beverage: element.is_beverage === true,
    is_beverage_advanced: element.is_beverage_advanced === true,
    is_archived: element.is_archived === true,
    createdAt: element.createdAt,
    updatedAt: element.updatedAt,
  };
}

async function loadUserMenu(strapi, userId) {
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

async function ensureUserMenu(strapi, userId) {
  const existing = await loadUserMenu(strapi, userId);
  if (existing) return existing;

  return strapi.documents('api::menu.menu').create({
    data: {
      fk_user: { connect: [{ id: userId }] },
    },
    status: 'published',
  });
}

async function userOwnsElement(strapi, userId, documentId) {
  if (!userId || !documentId) return false;
  const rows = await strapi.documents('api::element.element').findMany({
    filters: {
      documentId: { $eq: documentId },
      fk_user: { id: { $eq: userId } },
    },
    fields: ['documentId'],
    limit: 1,
  });
  return Array.isArray(rows) && rows.length > 0;
}

module.exports = createCoreController('api::element.element', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    const payload = ctx.request.body?.data || ctx.request.body || {};
    const parsed = buildElementData(payload);
    if (!parsed.ok) return ctx.badRequest(parsed.message);

    try {
      // Risolve `is_beverage` se non fornito esplicitamente: rispecchia il
      // routing staff per quella categoria (override pro se presente, regex
      // altrimenti). Garantisce coerenza bevande slot ⇔ bar slot.
      if (parsed.data.is_beverage === undefined && parsed.data.category) {
        const owner = await strapi.db.query('plugin::users-permissions.user').findOne({
          where: { id: user.id },
          select: ['id', 'subscription_status', 'subscription_plan', 'subscription_current_period_end', 'end_subscription'],
        });
        parsed.data.is_beverage = await isBarRoutedCategory(strapi, owner, parsed.data.category);
      }

      const created = await strapi.documents('api::element.element').create({
        data: {
          ...parsed.data,
          fk_user: { connect: [{ id: user.id }] },
        },
        status: 'published',
      });
      await ensureCategoryRouting(strapi, user.id, parsed.data.category);

      // Sincronizza la "ricetta strutturata" (ElementIngredient) con la lista
      // di stringhe fornita. Dual-write: il JSON legacy resta su Element.ingredients
      // finche FASE 4 non lo elimina.
      if (parsed.data.ingredients !== undefined) {
        try {
          await ingredientsService.syncElementRecipe(strapi, user.id, created.id, parsed.data.ingredients);
        } catch (recipeErr) {
          strapi.log.warn(`element.create: syncElementRecipe fallita per ${created.documentId}: ${recipeErr.message}`);
        }
      }

      const menu = await ensureUserMenu(strapi, user.id);
      const existingConn = Array.isArray(menu.fk_elements)
        ? menu.fk_elements
            .map((item) => item && item.documentId ? { documentId: item.documentId } : null)
            .filter(Boolean)
        : [];

      await strapi.documents('api::menu.menu').update({
        documentId: menu.documentId,
        data: {
          fk_elements: {
            connect: [...existingConn, { documentId: created.documentId }],
          },
        },
        status: 'published',
      });

      ctx.status = 201;
      ctx.body = { data: serializeElement(created) };
    } catch (error) {
      strapi.log.error('Errore in element.create:', error);
      return ctx.internalServerError('Impossibile creare l\'elemento.');
    }
  },

  async update(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    const { documentId } = ctx.params;
    if (!documentId) return ctx.badRequest('documentId mancante.');

    const payload = ctx.request.body?.data || ctx.request.body || {};
    const parsed = buildElementData(payload, { partial: true });
    if (!parsed.ok) return ctx.badRequest(parsed.message);

    try {
      if (!(await userOwnsElement(strapi, user.id, documentId))) {
        return ctx.notFound('Elemento non trovato.');
      }

      // Se cambia categoria e `is_beverage` non e' stato fornito esplicito,
      // riallinea il flag al routing staff "bar" (override pro o regex).
      if (parsed.data.is_beverage === undefined && parsed.data.category) {
        const owner = await strapi.db.query('plugin::users-permissions.user').findOne({
          where: { id: user.id },
          select: ['id', 'subscription_status', 'subscription_plan', 'subscription_current_period_end', 'end_subscription'],
        });
        parsed.data.is_beverage = await isBarRoutedCategory(strapi, owner, parsed.data.category);
      }

      const updated = await strapi.documents('api::element.element').update({
        documentId,
        data: parsed.data,
        status: 'published',
      });
      if (parsed.data.category) {
        await ensureCategoryRouting(strapi, user.id, parsed.data.category);
      }

      // Sincronizza ricetta strutturata se il campo ingredients e' stato fornito
      // (partial update: undefined => no-op).
      if (parsed.data.ingredients !== undefined) {
        try {
          await ingredientsService.syncElementRecipe(strapi, user.id, updated.id, parsed.data.ingredients);
        } catch (recipeErr) {
          strapi.log.warn(`element.update: syncElementRecipe fallita per ${updated.documentId}: ${recipeErr.message}`);
        }
      }

      ctx.body = { data: serializeElement(updated) };
    } catch (error) {
      strapi.log.error('Errore in element.update:', error);
      return ctx.internalServerError('Impossibile aggiornare l\'elemento.');
    }
  },

  /**
   * GET /api/elements/:documentId/recipe
   * Ritorna la ricetta strutturata (ingredient + qty_per_serving).
   * Pro-only (gating verra fatto via middleware su rotta dedicata).
   */
  async getRecipe(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');
    const { documentId } = ctx.params;
    if (!documentId) return ctx.badRequest('documentId mancante.');
    try {
      if (!(await userOwnsElement(strapi, user.id, documentId))) {
        return ctx.notFound('Elemento non trovato.');
      }

      const recipe = await ingredientsService.listElementRecipe(strapi, documentId);
      ctx.body = { data: { recipe } };
    } catch (error) {
      strapi.log.error('Errore in element.getRecipe:', error);
      return ctx.internalServerError('Impossibile leggere la ricetta.');
    }
  },

  /**
   * PUT /api/elements/:documentId/recipe
   * Body: { recipe: [{ name, qty_per_serving, unit?, unit_size? }] }
   * Replace atomic della ricetta strutturata.
   */
  async setRecipe(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');
    const { documentId } = ctx.params;
    if (!documentId) return ctx.badRequest('documentId mancante.');
    try {
      if (!(await userOwnsElement(strapi, user.id, documentId))) {
        return ctx.notFound('Elemento non trovato.');
      }

      const body = ctx.request.body?.data || ctx.request.body || {};
      const recipe = Array.isArray(body.recipe) ? body.recipe : null;
      if (!recipe) return ctx.badRequest('recipe (array) obbligatorio.');

      await ingredientsService.setStructuredRecipe(strapi, user.id, documentId, recipe);

      const next = await ingredientsService.listElementRecipe(strapi, documentId);
      ctx.body = { data: { recipe: next } };
    } catch (error) {
      strapi.log.error('Errore in element.setRecipe:', error);
      return ctx.internalServerError('Impossibile aggiornare la ricetta.');
    }
  },

  /**
   * DELETE /api/elements/:documentId
   *
   * Soft delete: l'Element non viene rimosso dal DB ma flaggato `is_archived=true`.
   * Questo preserva la FK integrity con OrderItem.fk_element (cosi' i report storici
   * mantengono il link live al menu item). I lettori (public menu, gestionale,
   * BeverageList) filtrano `is_archived=false`.
   *
   * Le ElementIngredient (ricetta strutturata) restano in DB: in FASE 4
   * verra' aggiunto un cleanup batch per archivi superflui se necessario.
   */
  async remove(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    const { documentId } = ctx.params;
    if (!documentId) return ctx.badRequest('documentId mancante.');

    try {
      if (!(await userOwnsElement(strapi, user.id, documentId))) {
        return ctx.notFound('Elemento non trovato.');
      }

      // Soft delete: flaggato come archiviato. Resta in DB con il link a menu.fk_elements
      // perche gli OrderItem.fk_element vecchi potrebbero ancora puntarci.
      await strapi.documents('api::element.element').update({
        documentId,
        data: { is_archived: true, available: false },
        status: 'published',
      });

      ctx.status = 204;
      ctx.body = null;
    } catch (error) {
      strapi.log.error('Errore in element.remove:', error);
      return ctx.internalServerError('Impossibile eliminare l\'elemento.');
    }
  },
}));
