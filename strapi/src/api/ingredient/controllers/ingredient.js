'use strict';

// Normalizza il nome di un ingrediente per confronti: trim + lowercase.
const norm = (s) => String(s || '').trim().toLowerCase();

// Recupera gli elementi del menu dell'utente (tutte le righe draft+published).
async function loadUserElements(strapi, userId) {
  const menus = await strapi.db.query('api::menu.menu').findMany({
    where: { fk_user: { id: userId } },
    populate: { fk_elements: true },
  });
  // Dedup per documentId: gli elementi possono comparire in menu draft e published.
  const seen = new Map();
  for (const m of menus) {
    for (const el of m.fk_elements || []) {
      if (!seen.has(el.documentId)) seen.set(el.documentId, el);
    }
  }
  return Array.from(seen.values());
}

// Aggiorna l'availability di un elemento (documentId) su tutte le sue varianti (draft+published).
async function setElementAvailability(strapi, documentId, available) {
  await strapi.db.query('api::element.element').updateMany({
    where: { documentId },
    data: { available },
  });
}

module.exports = {
  /**
   * GET /api/ingredients
   * Restituisce la lista degli ingredienti unici presenti nel menu dell'utente,
   * con conteggio piatti, piatti coinvolti e flag di disponibilità.
   */
  async list(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();

    const freshUser = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: user.id },
      select: ['id', 'unavailable_ingredients'],
    });
    const unavailableList = Array.isArray(freshUser?.unavailable_ingredients)
      ? freshUser.unavailable_ingredients
      : [];
    const unavailableSet = new Set(unavailableList.map(norm));

    const elements = await loadUserElements(strapi, user.id);

    // Aggrega: chiave normalizzata -> { displayName, count, dishes[], unavailable }
    const agg = new Map();
    for (const el of elements) {
      const ings = Array.isArray(el.ingredients) ? el.ingredients : [];
      for (const raw of ings) {
        const key = norm(raw);
        if (!key) continue;
        if (!agg.has(key)) {
          agg.set(key, {
            key,
            name: String(raw).trim(),
            count: 0,
            dishes: [],
            unavailable: unavailableSet.has(key),
          });
        }
        const entry = agg.get(key);
        entry.count += 1;
        entry.dishes.push({ documentId: el.documentId, name: el.name, available: el.available !== false });
      }
    }

    const ingredients = Array.from(agg.values()).sort((a, b) => a.name.localeCompare(b.name, 'it'));
    return ctx.send({ data: { ingredients } });
  },

  /**
   * PUT /api/ingredients/toggle
   * body: { ingredient: "Pomodoro", unavailable: true|false }
   * Aggiorna la lista `unavailable_ingredients` dell'utente e propaga la disponibilità
   * a tutti i piatti contenenti quell'ingrediente.
   */
  async toggle(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();

    const { ingredient, unavailable } = ctx.request.body || {};
    if (typeof ingredient !== 'string' || !ingredient.trim()) {
      return ctx.badRequest('Ingrediente non valido');
    }
    if (typeof unavailable !== 'boolean') {
      return ctx.badRequest('Flag unavailable richiesto (boolean)');
    }

    const key = norm(ingredient);

    const freshUser = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: user.id },
      select: ['id', 'unavailable_ingredients'],
    });
    const current = Array.isArray(freshUser?.unavailable_ingredients)
      ? freshUser.unavailable_ingredients
      : [];
    const currentSet = new Set(current.map(norm));

    if (unavailable) currentSet.add(key);
    else currentSet.delete(key);

    // Salva la lista normalizzata (lower-case, trimmed).
    const newList = Array.from(currentSet);
    await strapi.db.query('plugin::users-permissions.user').update({
      where: { id: user.id },
      data: { unavailable_ingredients: newList },
    });

    // Cascade: ricalcola availability di tutti i piatti dell'utente in base alla lista aggiornata.
    const elements = await loadUserElements(strapi, user.id);
    const affected = [];
    for (const el of elements) {
      const ings = Array.isArray(el.ingredients) ? el.ingredients : [];
      const hasUnavailableIng = ings.some((i) => currentSet.has(norm(i)));
      const nextAvailable = !hasUnavailableIng;
      if ((el.available !== false) !== nextAvailable) {
        await setElementAvailability(strapi, el.documentId, nextAvailable);
        affected.push({ documentId: el.documentId, name: el.name, available: nextAvailable });
      }
    }

    return ctx.send({
      data: {
        ingredient: ingredient.trim(),
        unavailable,
        unavailable_ingredients: newList,
        affected_dishes: affected,
      },
    });
  },
};
