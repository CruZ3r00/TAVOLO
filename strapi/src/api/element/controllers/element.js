'use strict';

/**
 * element controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { ensureCategoryRouting } = require('../../../utils/category-routing');

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

module.exports = createCoreController('api::element.element', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    const payload = ctx.request.body?.data || ctx.request.body || {};
    const parsed = buildElementData(payload);
    if (!parsed.ok) return ctx.badRequest(parsed.message);

    try {
      const created = await strapi.documents('api::element.element').create({
        data: {
          ...parsed.data,
          fk_user: { connect: [{ id: user.id }] },
        },
        status: 'published',
      });
      await ensureCategoryRouting(strapi, user.id, parsed.data.category);

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
      const menu = await loadUserMenu(strapi, user.id);
      if (!menu) return ctx.notFound('Menu non trovato.');

      const ownsElement = Array.isArray(menu.fk_elements)
        && menu.fk_elements.some((item) => item.documentId === documentId);

      if (!ownsElement) return ctx.notFound('Elemento non trovato.');

      const updated = await strapi.documents('api::element.element').update({
        documentId,
        data: parsed.data,
        status: 'published',
      });
      if (parsed.data.category) {
        await ensureCategoryRouting(strapi, user.id, parsed.data.category);
      }

      ctx.body = { data: serializeElement(updated) };
    } catch (error) {
      strapi.log.error('Errore in element.update:', error);
      return ctx.internalServerError('Impossibile aggiornare l\'elemento.');
    }
  },

  async remove(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    const { documentId } = ctx.params;
    if (!documentId) return ctx.badRequest('documentId mancante.');

    try {
      const menu = await loadUserMenu(strapi, user.id);
      if (!menu) return ctx.notFound('Menu non trovato.');

      let found = false;
      const remainingConn = [];

      for (const item of menu.fk_elements || []) {
        if (!item || !item.documentId) continue;
        if (item.documentId === documentId) {
          found = true;
          continue;
        }
        remainingConn.push({ documentId: item.documentId });
      }

      if (!found) return ctx.notFound('Elemento non trovato.');

      await strapi.documents('api::menu.menu').update({
        documentId: menu.documentId,
        data: {
          fk_elements: {
            set: remainingConn,
          },
        },
        status: 'published',
      });

      await strapi.documents('api::element.element').delete({ documentId });

      ctx.status = 204;
      ctx.body = null;
    } catch (error) {
      strapi.log.error('Errore in element.remove:', error);
      return ctx.internalServerError('Impossibile eliminare l\'elemento.');
    }
  },
}));
