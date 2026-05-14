'use strict';

/**
 * Backfill ingredients dal JSON legacy alle nuove entity strutturate.
 *
 * Per ogni Element di ogni owner:
 *   - parse `Element.ingredients` JSON (array di stringhe)
 *   - per ogni stringa: find-or-create Ingredient(fk_user, name_normalized)
 *   - crea ElementIngredient(fk_element, fk_ingredient, qty_per_serving=0)
 *     se non esiste gia.
 *
 * Per ogni owner: legge `User.unavailable_ingredients` JSON e setta
 * `Ingredient.is_unavailable=true` sui match per nome.
 *
 * Proprieta:
 *   - Idempotente: girare 2 volte produce lo stesso risultato (no duplicati).
 *   - Fail-soft: errori su singoli Element vengono loggati e ignorati.
 *   - Non distruttiva: non tocca `Element.ingredients` JSON ne'
 *     `User.unavailable_ingredients` JSON (cleanup in FASE 4).
 *
 * NOTE Strapi v5: le FK manyToOne vivono in tabelle `*_lnk` separate.
 * `ingredients_fk_user_lnk(ingredient_id, user_id)` e simili. Le query qui
 * usano knex raw per portabilita cross-dialect.
 */

const crypto = require('crypto');

const norm = (s) => String(s || '').trim().toLowerCase();
const trim = (s) => String(s || '').trim();

/**
 * Genera un documentId Strapi-style (24 hex chars).
 */
function genDocId() {
  return crypto.randomBytes(12).toString('hex');
}

async function hasTable(knex, name) {
  return knex.schema.hasTable(name);
}

async function hasColumn(knex, table, col) {
  if (!(await hasTable(knex, table))) return false;
  return knex.schema.hasColumn(table, col);
}

/**
 * Parse JSON con fallback su array vuoto.
 */
function safeParseJson(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  }
  if (typeof value === 'object') return [];
  return [];
}

/**
 * Find-or-create Ingredient via SQL raw (idempotente).
 * Ritorna { id, name_normalized } o null in caso di errore.
 */
async function findOrCreateIngredient(knex, ownerId, rawName) {
  const display = trim(rawName);
  if (!display) return null;
  const key = norm(display);

  // 1) Lookup via join lnk
  const found = await knex({ i: 'ingredients' })
    .innerJoin('ingredients_fk_user_lnk as lnk', 'lnk.ingredient_id', 'i.id')
    .where('lnk.user_id', ownerId)
    .where('i.name_normalized', key)
    .select('i.id as id', 'i.name_normalized as name_normalized')
    .first();
  if (found && found.id) return { id: found.id, name_normalized: found.name_normalized };

  // 2) Insert nuovo + lnk
  const now = new Date();
  const docId = genDocId();

  // Strapi v5 con publishedAt nullable per draftAndPublish=false: setta
  // `published_at` a now per coerenza.
  const inserted = await knex('ingredients').insert({
    document_id: docId,
    name: display,
    name_normalized: key,
    unit: 'pz',
    stock_qty: 0,
    reorder_lead_days: 3,
    is_unavailable: false,
    is_active: true,
    created_at: now,
    updated_at: now,
    published_at: now,
  }).returning('id');

  // returning('id') puo' ritornare formati diversi a seconda del dialect.
  let newId = null;
  if (Array.isArray(inserted) && inserted.length > 0) {
    const first = inserted[0];
    newId = typeof first === 'object' ? first.id : first;
  }
  if (!newId) {
    // Fallback: re-query
    const re = await knex({ i: 'ingredients' })
      .where('i.document_id', docId)
      .select('i.id as id')
      .first();
    if (re) newId = re.id;
  }
  if (!newId) return null;

  await knex('ingredients_fk_user_lnk').insert({
    ingredient_id: newId,
    user_id: ownerId,
  });

  return { id: newId, name_normalized: key };
}

/**
 * Crea l'ElementIngredient (fk_element, fk_ingredient, qty=0) se non esiste.
 */
async function ensureElementIngredient(knex, elementId, ingredientId) {
  // Lookup existing link
  const existing = await knex({ ei: 'element_ingredients' })
    .innerJoin('element_ingredients_fk_element_lnk as ellnk', 'ellnk.element_ingredient_id', 'ei.id')
    .innerJoin('element_ingredients_fk_ingredient_lnk as ilnk', 'ilnk.element_ingredient_id', 'ei.id')
    .where('ellnk.element_id', elementId)
    .where('ilnk.ingredient_id', ingredientId)
    .select('ei.id as id')
    .first();
  if (existing && existing.id) return existing.id;

  const now = new Date();
  const docId = genDocId();
  const inserted = await knex('element_ingredients').insert({
    document_id: docId,
    qty_per_serving: 0,
    created_at: now,
    updated_at: now,
    published_at: now,
  }).returning('id');

  let newId = null;
  if (Array.isArray(inserted) && inserted.length > 0) {
    const first = inserted[0];
    newId = typeof first === 'object' ? first.id : first;
  }
  if (!newId) {
    const re = await knex({ ei: 'element_ingredients' })
      .where('ei.document_id', docId)
      .select('ei.id as id')
      .first();
    if (re) newId = re.id;
  }
  if (!newId) return null;

  await knex('element_ingredients_fk_element_lnk').insert({
    element_ingredient_id: newId,
    element_id: elementId,
  });
  await knex('element_ingredients_fk_ingredient_lnk').insert({
    element_ingredient_id: newId,
    ingredient_id: ingredientId,
  });

  return newId;
}

module.exports = {
  async up(knex) {
    // Pre-check: se le nuove tabelle non esistono ancora (es. prima della
    // migration di schema), no-op silenzioso.
    const need = ['ingredients', 'element_ingredients', 'elements'];
    for (const t of need) {
      if (!(await hasTable(knex, t))) {
        console.log(`[ingredients_backfill] tabella ${t} non esiste, skip.`);
        return;
      }
    }
    const needCols = [
      ['elements', 'ingredients'],
      ['elements_fk_user_lnk', 'user_id'],
    ];
    for (const [t, c] of needCols) {
      if (!(await hasColumn(knex, t, c))) {
        console.log(`[ingredients_backfill] colonna ${t}.${c} non esiste, skip.`);
        return;
      }
    }

    // 1) Backfill ricetta: per ogni Element con il suo owner, parse ingredients
    //    JSON e crea Ingredient + ElementIngredient.
    const elements = await knex({ e: 'elements' })
      .innerJoin('elements_fk_user_lnk as ulnk', 'ulnk.element_id', 'e.id')
      .select('e.id as element_id', 'e.ingredients as ingredients_raw', 'ulnk.user_id as owner_id');

    let totalElems = 0;
    let totalLinks = 0;
    let totalErrors = 0;

    for (const row of elements || []) {
      const ownerId = row.owner_id;
      const elementId = row.element_id;
      if (!ownerId || !elementId) continue;

      const ingNames = safeParseJson(row.ingredients_raw).filter(
        (x) => typeof x === 'string' && trim(x)
      );
      if (ingNames.length === 0) continue;

      totalElems += 1;
      for (const name of ingNames) {
        try {
          const ing = await findOrCreateIngredient(knex, ownerId, name);
          if (!ing) continue;
          const linkId = await ensureElementIngredient(knex, elementId, ing.id);
          if (linkId) totalLinks += 1;
        } catch (err) {
          totalErrors += 1;
          if (totalErrors <= 5) {
            console.warn(`[ingredients_backfill] errore element ${elementId} / "${name}": ${err.message}`);
          }
        }
      }
    }

    console.log(`[ingredients_backfill] backfilled ${totalLinks} ElementIngredient su ${totalElems} elementi (errori soft: ${totalErrors}).`);

    // 2) Migra User.unavailable_ingredients → Ingredient.is_unavailable
    if (!(await hasColumn(knex, 'up_users', 'unavailable_ingredients'))) {
      console.log('[ingredients_backfill] up_users.unavailable_ingredients non esiste, skip toggle migration.');
      return;
    }

    const users = await knex('up_users')
      .whereNotNull('unavailable_ingredients')
      .select('id', 'unavailable_ingredients');

    let totalUnav = 0;
    for (const u of users || []) {
      const names = safeParseJson(u.unavailable_ingredients)
        .filter((x) => typeof x === 'string' && trim(x))
        .map(norm);
      if (names.length === 0) continue;

      for (const key of names) {
        try {
          // Update Ingredient.is_unavailable=true per matching name_normalized
          // dell'owner.
          const upd = await knex('ingredients as i')
            .innerJoin('ingredients_fk_user_lnk as lnk', 'lnk.ingredient_id', 'i.id')
            .where('lnk.user_id', u.id)
            .where('i.name_normalized', key)
            .update({ 'i.is_unavailable': true, 'i.updated_at': new Date() });
          if (upd > 0) totalUnav += upd;
        } catch (err) {
          // Su alcuni dialect (PG) `update` con alias+join puo' rifiutare.
          // Fallback: subquery.
          try {
            const ids = await knex({ i: 'ingredients' })
              .innerJoin('ingredients_fk_user_lnk as lnk', 'lnk.ingredient_id', 'i.id')
              .where('lnk.user_id', u.id)
              .where('i.name_normalized', key)
              .pluck('i.id');
            if (ids.length > 0) {
              await knex('ingredients')
                .whereIn('id', ids)
                .update({ is_unavailable: true, updated_at: new Date() });
              totalUnav += ids.length;
            }
          } catch (err2) {
            console.warn(`[ingredients_backfill] toggle owner=${u.id} key="${key}" fallito: ${err2.message}`);
          }
        }
      }
    }

    console.log(`[ingredients_backfill] migrati ${totalUnav} Ingredient.is_unavailable.`);
  },

  async down() {
    // Backfill puro: niente da rollbackare. Le righe create restano in DB
    // perche cancellarle potrebbe perdere dati nel frattempo modificati
    // dall'applicazione.
  },
};
