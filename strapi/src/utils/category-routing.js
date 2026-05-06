'use strict';

const { STAFF_ROLES } = require('./staff-access');

const ROUTABLE_STAFF_ROLES = [
  STAFF_ROLES.CUCINA,
  STAFF_ROLES.BAR,
  STAFF_ROLES.PIZZERIA,
  STAFF_ROLES.CUCINA_SG,
];

const ROUTABLE_STAFF_ROLE_SET = new Set(ROUTABLE_STAFF_ROLES);

function cleanCategory(value) {
  return String(value || '').trim();
}

function categoryKey(value) {
  return cleanCategory(value).toLowerCase();
}

function normalizeStation(value) {
  const station = String(value || '').trim().toLowerCase();
  return ROUTABLE_STAFF_ROLE_SET.has(station) ? station : null;
}

function classifyCategory(category) {
  const value = cleanCategory(category).toLowerCase();
  if (!value) return STAFF_ROLES.CUCINA;

  if (/(bevande|bibite|drink|cocktail|vino|vini|birra|birre|amari|liquori|distillati|aperitivi|\bbar\b|caffe|caffè|acqua|soft drink|analcolic)/.test(value)) {
    return STAFF_ROLES.BAR;
  }
  if (/(senza glutine|gluten free|gluten-free|\bsg\b|celiac|celiach)/.test(value)) {
    return STAFF_ROLES.CUCINA_SG;
  }
  if (/(pizza|pizze|pizzeria|focaccia|calzone)/.test(value)) {
    return STAFF_ROLES.PIZZERIA;
  }

  return STAFF_ROLES.CUCINA;
}

function hasActiveSubscription(owner) {
  if (!owner || !['active', 'trialing'].includes(owner.subscription_status)) return false;
  const periodEnd = owner.subscription_current_period_end || owner.end_subscription;
  if (!periodEnd) return true;
  const periodEndDate = new Date(periodEnd);
  return !Number.isNaN(periodEndDate.getTime()) && periodEndDate.getTime() >= Date.now();
}

function ownerHasProfessionalRouting(owner) {
  return hasActiveSubscription(owner) && String(owner.subscription_plan || '').toLowerCase() === 'pro';
}

async function findRoutingRow(strapi, ownerId, category) {
  const clean = cleanCategory(category);
  if (!ownerId || !clean || !strapi.db.connection) return null;

  return strapi.db.connection('restaurant_category_routing')
    .select(['id', 'category', 'staff_role', 'locked'])
    .where('owner_id', ownerId)
    .whereRaw('lower(category) = lower(?)', [clean])
    .first();
}

async function ensureCategoryRouting(strapi, ownerId, category) {
  const clean = cleanCategory(category);
  if (!ownerId || !clean || !strapi.db.connection) return classifyCategory(clean);

  try {
    const existing = await findRoutingRow(strapi, ownerId, clean);
    if (existing) return normalizeStation(existing.staff_role) || STAFF_ROLES.CUCINA;

    const staffRole = classifyCategory(clean);
    await strapi.db.connection('restaurant_category_routing').insert({
      owner_id: ownerId,
      category: clean,
      staff_role: staffRole,
      locked: false,
    });
    return staffRole;
  } catch (err) {
    if (!String(err && err.message || '').toLowerCase().includes('unique')) {
      strapi.log.warn(`category routing: ensure fallita per user ${ownerId}: ${err.message}`);
    }
    try {
      const row = await findRoutingRow(strapi, ownerId, clean);
      return normalizeStation(row && row.staff_role) || classifyCategory(clean);
    } catch (_ignored) {
      return classifyCategory(clean);
    }
  }
}

async function stationForCategory(strapi, owner, category) {
  const clean = cleanCategory(category);
  if (!clean) return STAFF_ROLES.CUCINA;
  if (!ownerHasProfessionalRouting(owner)) return STAFF_ROLES.CUCINA;

  await ensureCategoryRouting(strapi, owner.id, clean);

  try {
    const row = await findRoutingRow(strapi, owner.id, clean);
    return normalizeStation(row && row.staff_role) || classifyCategory(clean);
  } catch (_err) {
    return classifyCategory(clean);
  }
}

/**
 * Eager-load di tutto il routing categoria->station per un owner.
 * Una sola query DB; sostituisce N chiamate sequenziali a stationForCategory
 * quando si serializzano molti item.
 *
 * Restituisce una funzione lookup(category) -> station che applica fallback a
 * classifyCategory per categorie non ancora in tabella.
 */
async function loadRoutingMap(strapi, owner) {
  const ownerId = owner && owner.id;
  const proRouting = ownerHasProfessionalRouting(owner);
  const map = new Map();

  if (proRouting && ownerId && strapi.db.connection) {
    try {
      const rows = await strapi.db.connection('restaurant_category_routing')
        .select(['category', 'staff_role'])
        .where('owner_id', ownerId);
      for (const row of rows || []) {
        const key = categoryKey(row.category);
        const station = normalizeStation(row.staff_role);
        if (key && station) map.set(key, station);
      }
    } catch (err) {
      strapi.log.warn(`category routing: loadRoutingMap fallita per user ${ownerId}: ${err.message}`);
    }
  }

  return function lookup(category) {
    const clean = cleanCategory(category);
    if (!clean) return STAFF_ROLES.CUCINA;
    if (!proRouting) return STAFF_ROLES.CUCINA;
    return map.get(categoryKey(clean)) || classifyCategory(clean);
  };
}

async function listMenuCategories(strapi, ownerId) {
  if (!ownerId) return [];

  const counts = new Map();
  const menus = await strapi.documents('api::menu.menu').findMany({
    filters: { fk_user: { id: { $eq: ownerId } } },
    populate: { fk_elements: true },
    status: 'published',
    sort: ['createdAt:asc'],
    limit: 1,
  });
  const menu = Array.isArray(menus) && menus.length > 0 ? menus[0] : null;

  for (const element of menu && Array.isArray(menu.fk_elements) ? menu.fk_elements : []) {
    const category = cleanCategory(element && element.category);
    if (!category) continue;
    const key = categoryKey(category);
    const existing = counts.get(key);
    if (existing) {
      existing.item_count += 1;
    } else {
      counts.set(key, { category, item_count: 1 });
    }
  }

  return [...counts.values()].sort((a, b) => a.category.localeCompare(b.category, 'it'));
}

async function listCategoryRouting(strapi, owner) {
  const ownerId = owner && owner.id;
  if (!ownerId) return [];

  const categories = await listMenuCategories(strapi, ownerId);
  for (const item of categories) {
    await ensureCategoryRouting(strapi, ownerId, item.category);
  }

  const rows = strapi.db.connection
    ? await strapi.db.connection('restaurant_category_routing')
      .select(['category', 'staff_role', 'locked'])
      .where('owner_id', ownerId)
    : [];
  const byCategory = new Map((rows || []).map((row) => [categoryKey(row.category), row]));

  return categories.map((item) => {
    const row = byCategory.get(categoryKey(item.category)) || {};
    return {
      category: item.category,
      item_count: item.item_count,
      staff_role: normalizeStation(row.staff_role) || classifyCategory(item.category),
      locked: row.locked === true,
    };
  });
}

async function updateCategoryRouting(strapi, owner, category, role) {
  const ownerId = owner && owner.id;
  const clean = cleanCategory(category);
  const station = normalizeStation(role);
  if (!ownerId || !clean || !station || !strapi.db.connection) return false;

  const existing = await findRoutingRow(strapi, ownerId, clean);
  if (existing) {
    await strapi.db.connection('restaurant_category_routing')
      .where('id', existing.id)
      .update({
        staff_role: station,
        locked: true,
      });
    return true;
  }

  await strapi.db.connection('restaurant_category_routing').insert({
    owner_id: ownerId,
    category: clean,
    staff_role: station,
    locked: true,
  });
  return true;
}

module.exports = {
  ROUTABLE_STAFF_ROLES,
  ROUTABLE_STAFF_ROLE_SET,
  cleanCategory,
  normalizeStation,
  classifyCategory,
  ownerHasProfessionalRouting,
  ensureCategoryRouting,
  stationForCategory,
  loadRoutingMap,
  listCategoryRouting,
  updateCategoryRouting,
};
