'use strict';

/**
 * Retry difensivo del cleanup `elements.ingredients`.
 *
 * La migration 202605140003 poteva essere registrata dopo uno skip quando la
 * link table ElementIngredient non era ancora presente. In quel caso i target
 * deploy restano con `elements.ingredients` legacy, talvolta ancora NOT NULL,
 * mentre il runtime corrente non scrive piu' quel campo.
 *
 * Priorita' produzione: rendere la colonna nullable se esiste, cosi' la create
 * manuale di Element non fallisce. Il drop resta condizionato al backfill gia'
 * completo.
 */

async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function hasColumn(knex, tableName, columnName) {
  if (!(await hasTable(knex, tableName))) return false;
  return knex.schema.hasColumn(tableName, columnName);
}

async function dropNotNullIfExists(knex) {
  if (!(await hasColumn(knex, 'elements', 'ingredients'))) return false;

  try {
    await knex.raw('ALTER TABLE elements ALTER COLUMN ingredients DROP NOT NULL');
  } catch (err) {
    const msg = String(err && err.message ? err.message : err).toLowerCase();
    if (!msg.includes('does not exist') && !msg.includes('is not null') && !msg.includes('no null')) {
      throw err;
    }
  }

  try {
    await knex.raw('ALTER TABLE elements ALTER COLUMN ingredients DROP DEFAULT');
  } catch (err) {
    const msg = String(err && err.message ? err.message : err).toLowerCase();
    if (!msg.includes('does not exist') && !msg.includes('default')) {
      throw err;
    }
  }

  return true;
}

async function countBackfillOrphans(knex) {
  const result = await knex.raw(`
    SELECT COUNT(*) AS n
    FROM elements e
    WHERE e.ingredients IS NOT NULL
      AND e.ingredients::text NOT IN ('null','[]','')
      AND NOT EXISTS (
        SELECT 1
        FROM element_ingredients_fk_element_lnk lnk
        WHERE lnk.element_id = e.id
      )
  `);
  return Number((result.rows && result.rows[0] && result.rows[0].n) || 0);
}

module.exports = {
  async up(knex) {
    if (!(await hasColumn(knex, 'elements', 'ingredients'))) {
      console.log('[element_ingredients_legacy_retry] elements.ingredients assente, skip.');
      return;
    }

    await dropNotNullIfExists(knex);

    if (!(await hasTable(knex, 'element_ingredients_fk_element_lnk'))) {
      console.log('[element_ingredients_legacy_retry] link table assente: colonna resa nullable, drop rimandato.');
      return;
    }

    const orphanCount = await countBackfillOrphans(knex);
    if (orphanCount > 0) {
      console.log(`[element_ingredients_legacy_retry] ${orphanCount} legacy ingredients non backfillati: colonna resa nullable, drop rimandato.`);
      return;
    }

    await knex.raw('UPDATE elements SET ingredients = NULL WHERE ingredients IS NOT NULL');
    await knex.schema.alterTable('elements', (table) => {
      table.dropColumn('ingredients');
    });
    console.log('[element_ingredients_legacy_retry] colonna elements.ingredients droppata.');
  },

  async down() {
    // One-way: il runtime corrente usa ElementIngredient come sorgente canonica.
  },
};
