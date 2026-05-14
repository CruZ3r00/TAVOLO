'use strict';

/**
 * Service ingredients: helper centrali per gestire la "ricetta strutturata"
 * (Ingredient + ElementIngredient) mantenendo identici input/output JSON
 * dei controller esistenti.
 *
 * Modello:
 *   - Ingredient: dictionary per owner, univoco per (fk_user, name_normalized).
 *     Su starter ha campi base (name, allergens, is_unavailable).
 *     Su pro ha anche stock_qty, unit, reorder_lead_days, supplier, ecc.
 *   - ElementIngredient: collegamento M:N fra Element e Ingredient con
 *     qty_per_serving (= 0 nel MVP starter; valorizzato in FASE 4 pro).
 *
 * Compatibilita:
 *   - I controller continuano a ricevere `ingredients: [string]` dal client.
 *   - I controller continuano a rispondere con `ingredients: [string]`.
 *   - Il campo legacy `Element.ingredients` JSON viene mantenuto come dual-write
 *     finche FASE 4 cleanup non lo elimina.
 *
 * Funzioni esposte:
 *   - normalize(s) → lowercase trimmato
 *   - findOrCreateIngredient(strapi, ownerId, rawName, opts) → { id, documentId, name, ... }
 *   - syncElementRecipe(strapi, ownerId, elementId, ingredientNames) → void
 *     Replace atomic della lista ElementIngredient di un Element.
 *   - listElementIngredientNames(strapi, elementId) → string[]
 *   - listOwnerIngredientsAggregate(strapi, ownerId) → [{ key,name,count,dishes,unavailable }]
 *   - setIngredientUnavailable(strapi, ownerId, ingredientIdOrName, unavailable) →
 *     { unavailable_ingredients, affected_dishes } (formato compat IngredientsManager)
 */

const norm = (s) => String(s || '').trim().toLowerCase();
const trim = (s) => String(s || '').trim();

/* ------------------------------------------------------------------ */
/* Ingredient find-or-create                                          */
/* ------------------------------------------------------------------ */

/**
 * Trova un Ingredient esistente per (ownerId, name_normalized) oppure ne
 * crea uno nuovo con i default starter.
 *
 * @param {object} strapi
 * @param {number} ownerId
 * @param {string} rawName
 * @param {{ unit?: string, allergens?: string[] }} [opts]
 */
async function findOrCreateIngredient(strapi, ownerId, rawName, opts = {}) {
  const display = trim(rawName);
  if (!display) return null;
  const key = norm(display);

  const existing = await strapi.db.query('api::ingredient.ingredient').findOne({
    where: { fk_user: { id: ownerId }, name_normalized: key },
  });
  if (existing) return existing;

  // Idempotenza: il DB ha un trigger su `ingredients_fk_user_lnk` che impone
  // l'univocita' di `(owner, name_normalized)` con `pg_advisory_xact_lock`.
  // Se due processi creano contemporaneamente, il secondo prende il lock e
  // alza `unique_violation` (23505 / errcode mappato). Catchiamo e ri-lookup.
  try {
    return await strapi.documents('api::ingredient.ingredient').create({
      data: {
        name: display,
        name_normalized: key,
        unit: opts.unit || 'pz',
        stock_qty: 0,
        reorder_lead_days: 3,
        is_unavailable: false,
        is_active: true,
        allergens: Array.isArray(opts.allergens) ? opts.allergens : null,
        fk_user: ownerId,
      },
    });
  } catch (err) {
    const code = err && (err.code || err.errno || err.original?.code);
    const msg = String(err && err.message ? err.message : '').toLowerCase();
    const isUniqueViolation = code === '23505' || msg.includes('duplicate ingredient name') || msg.includes('unique_violation');

    const retry = await strapi.db.query('api::ingredient.ingredient').findOne({
      where: { fk_user: { id: ownerId }, name_normalized: key },
    });
    if (retry) return retry;

    if (!isUniqueViolation) {
      strapi.log.warn(`ingredients.findOrCreate fallita per "${display}" owner=${ownerId}: ${err.message}`);
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Element recipe sync (replace transazionale)                        */
/* ------------------------------------------------------------------ */

/**
 * Sincronizza le ElementIngredient di un Element con la lista di stringhe
 * data. Replace atomic: cancella le righe esistenti e crea quelle nuove.
 *
 * Se `ingredientNames` e' undefined → no-op (chiamata partial update senza
 * il campo ingredients).
 * Se `ingredientNames` e' [] → cancella tutte le ElementIngredient.
 *
 * @param {object} strapi
 * @param {number} ownerId
 * @param {number|string} elementIdOrDoc — id numerico o documentId
 * @param {string[] | undefined} ingredientNames
 */
async function syncElementRecipe(strapi, ownerId, elementIdOrDoc, ingredientNames) {
  if (ingredientNames === undefined) return;
  const knex = strapi.db.connection;
  if (!knex) {
    strapi.log.error('syncElementRecipe: knex non disponibile');
    return;
  }

  const elementRows = await resolveElementRows(strapi, elementIdOrDoc);
  if (elementRows.length === 0) return;
  const elementIds = elementRows.map((r) => r.id);

  const desiredNames = Array.isArray(ingredientNames)
    ? ingredientNames.map(trim).filter(Boolean)
    : [];

  // Risolvi (or crea) gli Ingredient desiderati, deduplicati per id.
  const desiredIngById = new Map();
  for (const name of desiredNames) {
    const ing = await findOrCreateIngredient(strapi, ownerId, name);
    if (ing && !desiredIngById.has(ing.id)) desiredIngById.set(ing.id, ing);
  }

  await knex.transaction(async (trx) => {
    // Lista link esistenti per QUALSIASI riga (draft/published) del documento.
    const existingLinks = await trx('element_ingredients as ei')
      .join('element_ingredients_fk_element_lnk as fke', 'fke.element_ingredient_id', 'ei.id')
      .join('element_ingredients_fk_ingredient_lnk as fki', 'fki.element_ingredient_id', 'ei.id')
      .whereIn('fke.element_id', elementIds)
      .select('ei.id as ei_id', 'ei.qty_per_serving', 'fki.ingredient_id', 'fke.element_id');

    // Mappa: ingredient_id -> { qtyMax, eiIds[] } (per dedup).
    const byIngId = new Map();
    for (const r of existingLinks) {
      let entry = byIngId.get(r.ingredient_id);
      if (!entry) { entry = { qty: 0, eiIds: new Set() }; byIngId.set(r.ingredient_id, entry); }
      entry.eiIds.add(r.ei_id);
      const q = Number(r.qty_per_serving) || 0;
      if (q > entry.qty) entry.qty = q;
    }

    // Cancella: ElementIngredient legate a ingredient_id NON piu' desiderato,
    // e duplicati superflui per ingredient_id che resta (lasciamo 1 sola ei_id).
    const idsToDelete = [];
    const survivingByIng = new Map();
    for (const [ingId, entry] of byIngId.entries()) {
      const ids = [...entry.eiIds].sort((a, b) => a - b);
      if (!desiredIngById.has(ingId)) {
        // Non desiderato → tutte da cancellare
        idsToDelete.push(...ids);
      } else {
        // Desiderato → mantieni la prima, cancella le altre
        survivingByIng.set(ingId, { id: ids[0], qty: entry.qty });
        if (ids.length > 1) idsToDelete.push(...ids.slice(1));
      }
    }
    if (idsToDelete.length > 0) {
      await trx('element_ingredients_fk_element_lnk').whereIn('element_ingredient_id', idsToDelete).delete();
      await trx('element_ingredients_fk_ingredient_lnk').whereIn('element_ingredient_id', idsToDelete).delete();
      await trx('element_ingredients').whereIn('id', idsToDelete).delete();
    }

    // Per ogni ingredient_id sopravvissuto: garantisci che sia collegato a TUTTE
    // le righe dell'element (draft+published). Aggiungi i link mancanti.
    for (const [ingId, { id: eiId }] of survivingByIng.entries()) {
      const existingElemRows = await trx('element_ingredients_fk_element_lnk')
        .where('element_ingredient_id', eiId)
        .pluck('element_id');
      const missing = elementIds.filter((eid) => !existingElemRows.includes(eid));
      if (missing.length > 0) {
        await trx('element_ingredients_fk_element_lnk').insert(
          missing.map((eid) => ({ element_ingredient_id: eiId, element_id: eid })),
        );
      }
    }

    // Crea ElementIngredient per ingredient_id desiderati non ancora presenti.
    const now = new Date();
    for (const [ingId, ing] of desiredIngById.entries()) {
      if (survivingByIng.has(ingId)) continue;
      const docId = randomDocumentId();
      const inserted = await trx('element_ingredients').insert({
        qty_per_serving: 0,
        document_id: docId,
        created_at: now,
        updated_at: now,
        published_at: now,
        locale: null,
      }, ['id']);
      const newId = Array.isArray(inserted) ? (inserted[0]?.id ?? inserted[0]) : inserted;

      await trx('element_ingredients_fk_element_lnk').insert(
        elementIds.map((eid) => ({ element_ingredient_id: newId, element_id: eid })),
      );
      await trx('element_ingredients_fk_ingredient_lnk').insert({
        element_ingredient_id: newId,
        ingredient_id: ing.id,
      });
    }
  });
}

/* ------------------------------------------------------------------ */
/* Read helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Ritorna la lista di nomi degli ingredienti collegati a un Element via
 * ElementIngredient. Se nessuno trovato e l'Element ha il JSON legacy
 * popolato, fallback a quello (backward compat durante migrazione).
 *
 * @param {object} strapi
 * @param {number} elementId
 * @returns {Promise<string[]>}
 */
async function listElementIngredientNames(strapi, elementId) {
  const rows = await strapi.db.query('api::element-ingredient.element-ingredient').findMany({
    where: { fk_element: { id: elementId } },
    populate: { fk_ingredient: true },
  });

  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows
    .map((r) => r?.fk_ingredient?.name)
    .filter((n) => typeof n === 'string' && n.trim())
    .map(trim);
}

/**
 * Variante batch: per una lista di Element (con id) ritorna una Map
 * elementId -> string[]. Una query sola.
 */
async function batchListElementIngredientNames(strapi, elementIds) {
  const ids = (Array.isArray(elementIds) ? elementIds : []).filter(
    (x) => Number.isFinite(Number(x)) && Number(x) > 0
  ).map((x) => Number(x));
  if (ids.length === 0) return new Map();

  const rows = await strapi.db.query('api::element-ingredient.element-ingredient').findMany({
    where: { fk_element: { id: { $in: ids } } },
    populate: { fk_element: { select: ['id'] }, fk_ingredient: { select: ['name'] } },
  });

  const map = new Map();
  for (const r of rows || []) {
    const elId = r?.fk_element?.id;
    const name = r?.fk_ingredient?.name;
    if (!elId || !name) continue;
    if (!map.has(elId)) map.set(elId, []);
    map.get(elId).push(trim(name));
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* IngredientsManager aggregate                                       */
/* ------------------------------------------------------------------ */

/**
 * Aggrega gli ingredienti dell'owner replicando la shape attesa dal legacy
 * IngredientsManager (lista con count, dishes, unavailable).
 *
 * Output: [{ key, name, count, dishes: [{documentId,name,available}], unavailable }]
 */
async function listOwnerIngredientsAggregate(strapi, ownerId) {

  // 1) Tutti gli Ingredient attivi dell'owner. Dedup difensivo per
  //    name_normalized per gestire duplicati storici.
  const rawIngredients = await strapi.db.query('api::ingredient.ingredient').findMany({
    where: { fk_user: { id: ownerId }, is_active: true },
    orderBy: { name: 'asc' },
  });
  if (!Array.isArray(rawIngredients) || rawIngredients.length === 0) return [];
  const byKey = new Map();
  for (const ing of rawIngredients) {
    const key = String(ing.name_normalized || ing.name || '').toLowerCase();
    if (!byKey.has(key) || ing.id < byKey.get(key).id) byKey.set(key, ing);
  }
  const ingredients = [...byKey.values()];

  // 2) Tutte le ElementIngredient di questi ingredienti con i loro Element.
  const ingredientIds = ingredients.map((i) => i.id);
  const links = await strapi.db.query('api::element-ingredient.element-ingredient').findMany({
    where: { fk_ingredient: { id: { $in: ingredientIds } } },
    populate: {
      fk_ingredient: { select: ['id'] },
      fk_element: { select: ['id', 'documentId', 'name', 'available', 'is_archived'] },
    },
  });

  // 3) Raggruppa: ingredientId -> array dishes
  const dishesByIng = new Map();
  for (const link of links || []) {
    const ingId = link?.fk_ingredient?.id;
    const el = link?.fk_element;
    if (!ingId || !el || !el.documentId) continue;
    if (el.is_archived === true) continue;
    if (!dishesByIng.has(ingId)) dishesByIng.set(ingId, []);
    dishesByIng.get(ingId).push({
      documentId: el.documentId,
      name: el.name,
      available: el.available !== false,
    });
  }

  return ingredients.map((ing) => {
    const dishes = dishesByIng.get(ing.id) || [];
    return {
      key: ing.name_normalized,
      name: ing.name,
      count: dishes.length,
      dishes,
      unavailable: ing.is_unavailable === true,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Toggle unavailable + cascading element availability                */
/* ------------------------------------------------------------------ */

/**
 * Imposta `is_unavailable` su un Ingredient e propaga `available` agli Element
 * della ricetta. Compat con la API legacy `PUT /api/ingredients/toggle`.
 *
 * @param {object} strapi
 * @param {number} ownerId
 * @param {string} ingredientName — nome (case-insensitive)
 * @param {boolean} unavailable
 * @returns {Promise<{ ingredient, unavailable_ingredients, affected_dishes }>}
 */
async function setIngredientUnavailable(strapi, ownerId, ingredientName, unavailable) {
  const key = norm(ingredientName);
  if (!key) throw new Error('Nome ingrediente non valido.');

  // 1) Trova o crea l'Ingredient (l'owner potrebbe non averlo ancora se
  //    la chiamata arriva da un Element con JSON legacy non backfillato).
  let ing = await strapi.db.query('api::ingredient.ingredient').findOne({
    where: { fk_user: { id: ownerId }, name_normalized: key },
  });
  if (!ing) {
    ing = await findOrCreateIngredient(strapi, ownerId, ingredientName);
  }
  if (!ing) throw new Error('Impossibile creare l\'ingrediente.');

  await strapi.documents('api::ingredient.ingredient').update({
    documentId: ing.documentId,
    data: { is_unavailable: !!unavailable },
  });

  // 2) Ricalcola availability di TUTTI gli Element dell'owner in base alla
  //    lista completa di Ingredient.is_unavailable=true.
  const unavailableIngs = await strapi.db.query('api::ingredient.ingredient').findMany({
    where: { fk_user: { id: ownerId }, is_unavailable: true },
    select: ['id', 'name'],
  });
  const unavailableIngIds = unavailableIngs.map((x) => x.id);
  const unavailableNames = unavailableIngs.map((x) => x.name);

  // Element dell'owner. Strapi v5 link table fk_user.
  const elements = await strapi.db.query('api::element.element').findMany({
    where: { fk_user: { id: ownerId } },
    populate: { fk_element_ingredients: { populate: { fk_ingredient: { select: ['id'] } } } },
    select: ['id', 'documentId', 'name', 'available'],
  });

  const affected = [];
  const unavailableIdSet = new Set(unavailableIngIds);

  for (const el of elements || []) {
    // Element ha un ingrediente non-disponibile? sorgente: relazione ElementIngredient.
    let hasUnavail = false;
    const links = Array.isArray(el.fk_element_ingredients) ? el.fk_element_ingredients : [];
    for (const link of links) {
      const ingId = link?.fk_ingredient?.id;
      if (ingId && unavailableIdSet.has(ingId)) { hasUnavail = true; break; }
    }

    const nextAvailable = !hasUnavail;
    if ((el.available !== false) !== nextAvailable) {
      try {
        await strapi.db.query('api::element.element').updateMany({
          where: { documentId: el.documentId },
          data: { available: nextAvailable },
        });
      } catch (err) {
        strapi.log.warn(`setIngredientUnavailable: update element ${el.documentId} fallito: ${err.message}`);
        continue;
      }
      affected.push({ documentId: el.documentId, name: el.name, available: nextAvailable });
    }
  }

  return {
    ingredient: { id: ing.id, name: ing.name, unavailable: !!unavailable },
    unavailable_ingredients: unavailableNames,
    affected_dishes: affected,
  };
}

/* ------------------------------------------------------------------ */
/* Structured recipe (qty_per_serving)                                */
/* ------------------------------------------------------------------ */

/**
 * Risolve un elementIdOrDoc nelle righe DB corrispondenti (draft + published).
 * Strapi v5 mantiene due righe per documento quando draftAndPublish e' attivo.
 * Le ricette devono essere lette/scritte coerentemente su entrambe.
 */
async function resolveElementRows(strapi, elementIdOrDoc) {
  const knex = strapi.db.connection;
  if (!knex) return [];
  const isNumeric = typeof elementIdOrDoc === 'number' || /^\d+$/.test(String(elementIdOrDoc));
  const q = isNumeric
    ? knex('elements').where('id', Number(elementIdOrDoc))
    : knex('elements').where('document_id', String(elementIdOrDoc));
  return q.select('id', 'document_id', 'name', 'published_at');
}

/**
 * Imposta la ricetta strutturata di un Element con qty_per_serving valorizzato
 * per ogni Ingredient. Replace atomic delle ElementIngredient.
 *
 * Implementazione robusta su Strapi v5:
 *   - Cancella tutte le ElementIngredient gia collegate a qualsiasi riga
 *     (draft o published) dello stesso documentId — evita duplicati persistenti.
 *   - Crea una ElementIngredient per ogni (ingredient) e la collega a TUTTE
 *     le righe dell'element via knex sulle link tables. Cosi' la ricetta resta
 *     visibile sia che l'app legga la riga draft sia quella published.
 *
 * @param {object} strapi
 * @param {number} ownerId
 * @param {number|string} elementIdOrDoc
 * @param {Array<{ name, qty_per_serving, unit?, unit_size? }>} recipe
 */
async function setStructuredRecipe(strapi, ownerId, elementIdOrDoc, recipe) {
  if (!Array.isArray(recipe)) return;
  const knex = strapi.db.connection;
  if (!knex) {
    strapi.log.error('setStructuredRecipe: knex non disponibile');
    return;
  }

  const elementRows = await resolveElementRows(strapi, elementIdOrDoc);
  if (elementRows.length === 0) return;
  const elementIds = elementRows.map((r) => r.id);

  // 1) find-or-create Ingredient + patch unit/unit_size se forniti
  const enriched = [];
  const seenIngIds = new Set();
  for (const row of recipe) {
    if (!row || !row.name || typeof row.name !== 'string') continue;
    const name = trim(row.name);
    if (!name) continue;
    const qty = Number(row.qty_per_serving);
    if (!Number.isFinite(qty) || qty < 0) continue;

    const ing = await findOrCreateIngredient(strapi, ownerId, name, {
      unit: row.unit || 'ml',
    });
    if (!ing) continue;
    if (seenIngIds.has(ing.id)) continue; // dedup nello stesso payload
    seenIngIds.add(ing.id);

    const patch = {};
    if (row.unit && ['g', 'kg', 'ml', 'l', 'pz', 'mazzo'].includes(String(row.unit).toLowerCase()) && ing.unit !== row.unit) {
      patch.unit = String(row.unit).toLowerCase();
    }
    if (row.unit_size !== undefined && row.unit_size !== null) {
      const us = Number(row.unit_size);
      if (Number.isFinite(us) && us >= 0 && Number(ing.unit_size || 0) !== us) {
        patch.unit_size = us;
      }
    }
    if (Object.keys(patch).length > 0) {
      try {
        await knex('ingredients').where('id', ing.id).update({ ...patch, updated_at: new Date() });
      } catch (err) {
        strapi.log.warn(`setStructuredRecipe: patch ingredient ${ing.id} fallita: ${err.message}`);
      }
    }

    enriched.push({ ingredient: ing, qty_per_serving: qty });
  }

  // 2) Cancella TUTTE le ElementIngredient agganciate a qualsiasi riga
  //    (draft o published) di questo elemento — pulizia + idempotenza.
  await knex.transaction(async (trx) => {
    const linksRows = await trx('element_ingredients_fk_element_lnk')
      .whereIn('element_id', elementIds)
      .select('element_ingredient_id');
    const idsToDelete = [...new Set(linksRows.map((r) => r.element_ingredient_id))];
    if (idsToDelete.length > 0) {
      await trx('element_ingredients_fk_element_lnk').whereIn('element_ingredient_id', idsToDelete).delete();
      await trx('element_ingredients_fk_ingredient_lnk').whereIn('element_ingredient_id', idsToDelete).delete();
      await trx('element_ingredients').whereIn('id', idsToDelete).delete();
    }

    // 3) Crea le nuove righe e collegale a tutte le versioni dell'element.
    const now = new Date();
    for (const { ingredient, qty_per_serving } of enriched) {
      const docId = randomDocumentId();
      const inserted = await trx('element_ingredients').insert({
        qty_per_serving,
        document_id: docId,
        created_at: now,
        updated_at: now,
        published_at: now,
        locale: null,
      }, ['id']);
      const newId = Array.isArray(inserted) ? (inserted[0]?.id ?? inserted[0]) : inserted;

      // Link a tutte le row dell'element (draft + published)
      const elementLinks = elementIds.map((elemId, idx) => ({
        element_ingredient_id: newId,
        element_id: elemId,
        element_ingredient_ord: idx + 1,
      }));
      // Tenta con la colonna di ordering; se non esiste, retry senza.
      try {
        await trx('element_ingredients_fk_element_lnk').insert(elementLinks);
      } catch (errOrd) {
        await trx('element_ingredients_fk_element_lnk').insert(
          elementLinks.map(({ element_ingredient_id, element_id }) => ({ element_ingredient_id, element_id })),
        );
      }

      await trx('element_ingredients_fk_ingredient_lnk').insert({
        element_ingredient_id: newId,
        ingredient_id: ingredient.id,
      });
    }
  });
}

function randomDocumentId() {
  // Strapi v5 usa documentId base36 24-char. Generiamo qualcosa di compatibile.
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 24; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/**
 * Lista ricetta strutturata: per un Element ritorna
 * [{ ingredient: {id,documentId,name,unit,unit_size,stock_qty}, qty_per_serving }]
 *
 * Letta direttamente dalle link table: dedup automatico per ingredient_id,
 * indipendente da quale riga (draft/published) il populate avrebbe risolto.
 *
 * Fallback: se non esistono link strutturati ma Element.ingredients JSON
 * contiene nomi, ritorna placeholder con name + qty=0 cosi' l'editor mostra
 * subito gli ingredienti gia presenti sul piatto pronti per il dosaggio.
 */
async function listElementRecipe(strapi, elementIdOrDoc) {
  const knex = strapi.db.connection;
  if (!knex) return [];
  const elementRows = await resolveElementRows(strapi, elementIdOrDoc);
  if (elementRows.length === 0) return [];
  const elementIds = elementRows.map((r) => r.id);

  const rows = await knex('element_ingredients as ei')
    .join('element_ingredients_fk_element_lnk as fke', 'fke.element_ingredient_id', 'ei.id')
    .join('element_ingredients_fk_ingredient_lnk as fki', 'fki.element_ingredient_id', 'ei.id')
    .join('ingredients as i', 'i.id', 'fki.ingredient_id')
    .whereIn('fke.element_id', elementIds)
    .select(
      'i.id as ing_id',
      'i.document_id as ing_document_id',
      'i.name',
      'i.unit',
      'i.unit_size',
      'i.stock_qty',
      'ei.qty_per_serving',
    );

  const byIngId = new Map();
  for (const r of rows || []) {
    const qty = Number(r.qty_per_serving) || 0;
    const existing = byIngId.get(r.ing_id);
    if (!existing) {
      byIngId.set(r.ing_id, {
        ingredient: {
          id: r.ing_id,
          documentId: r.ing_document_id,
          name: r.name,
          unit: r.unit || 'pz',
          unit_size: r.unit_size !== null && r.unit_size !== undefined ? Number(r.unit_size) : null,
          stock_qty: Number(r.stock_qty) || 0,
        },
        qty_per_serving: qty,
      });
    } else if (qty > existing.qty_per_serving) {
      existing.qty_per_serving = qty;
    }
  }

  return [...byIngId.values()];
}

module.exports = {
  norm,
  trim,
  findOrCreateIngredient,
  syncElementRecipe,
  setStructuredRecipe,
  listElementIngredientNames,
  batchListElementIngredientNames,
  listOwnerIngredientsAggregate,
  setIngredientUnavailable,
  listElementRecipe,
};
