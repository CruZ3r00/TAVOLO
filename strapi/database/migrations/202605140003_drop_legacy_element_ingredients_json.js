'use strict';

/**
 * Fase 4 + 5 del cleanup ingredienti legacy:
 *
 *   - Sanity check: per ogni Element con `ingredients` JSON popolato deve
 *     esistere almeno una ElementIngredient correlata (backfill completato
 *     dalla migration 202605130002). Se la sanity fallisce, abort.
 *
 *   - Drop atomico della colonna `elements.ingredients`:
 *     1. ALTER COLUMN ... DROP NOT NULL (se presente)
 *     2. UPDATE elements SET ingredients = NULL (libera spazio per il drop)
 *     3. ALTER TABLE DROP COLUMN ingredients
 *
 * NOTA: NON tocca `elements.allergens` (fuori scope, viene tenuto come JSON).
 *
 * Idempotente: se la colonna non esiste, no-op silenzioso.
 * Non reversibile (down(): no-op). La colonna persa non e' ricostruibile dal
 * solo schema, ma il dato non e' perso perche' la sorgente di verita' (relazione
 * Ingredient ↔ ElementIngredient) e' completa.
 */

async function hasColumn(knex, tableName, columnName) {
  if (!(await knex.schema.hasTable(tableName))) return false;
  return knex.schema.hasColumn(tableName, columnName);
}

module.exports = {
  async up(knex) {
    if (!(await hasColumn(knex, 'elements', 'ingredients'))) {
      console.log('[drop_legacy_element_ingredients_json] colonna gia\' assente, skip.');
      return;
    }
    if (!(await knex.schema.hasTable('element_ingredients_fk_element_lnk'))) {
      console.log('[drop_legacy_element_ingredients_json] link table assente, skip cleanup legacy.');
      return;
    }

    // Sanity: tutti gli Element con JSON popolato hanno gia' ElementIngredient.
    const orphans = await knex.raw(`
      SELECT COUNT(*) AS n
      FROM elements e
      WHERE e.ingredients IS NOT NULL
        AND e.ingredients::text NOT IN ('null','[]','')
        AND NOT EXISTS (
          SELECT 1 FROM element_ingredients_fk_element_lnk lnk
          WHERE lnk.element_id = e.id
        )
    `);
    const orphanCount = Number((orphans.rows && orphans.rows[0] && orphans.rows[0].n) || 0);
    if (orphanCount > 0) {
      throw new Error(
        `[drop_legacy_element_ingredients_json] refuse to drop: ${orphanCount} elements con JSON popolato senza ElementIngredient. Esegui prima il backfill (migration 202605130002).`
      );
    }

    // 1) Rimuovi NOT NULL (era required: true nello schema legacy).
    try {
      await knex.raw(`ALTER TABLE elements ALTER COLUMN ingredients DROP NOT NULL`);
    } catch (err) {
      const msg = String(err && err.message ? err.message : '').toLowerCase();
      if (!msg.includes('does not exist') && !msg.includes('is not null') && !msg.includes('no null')) {
        throw err;
      }
    }

    // 2) Setta a NULL per dimezzare lo spazio e marcare il dato come logicamente assente.
    await knex.raw(`UPDATE elements SET ingredients = NULL WHERE ingredients IS NOT NULL`);

    // 3) Drop colonna.
    await knex.schema.alterTable('elements', (t) => {
      t.dropColumn('ingredients');
    });

    console.log('[drop_legacy_element_ingredients_json] colonna elements.ingredients droppata.');
  },

  async down() {
    // Non reversibile per design: il dato dipendente vive nelle relazioni.
  },
};
