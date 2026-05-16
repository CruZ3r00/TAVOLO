'use strict';

/**
 * Rende `element_ingredients.qty_per_serving` nullable.
 *
 * Semantica: `null` = ingrediente noto, dosaggio non ancora definito
 * (quick-form senza ricetta avanzata). `0` resta valido e significa
 * dosaggio esplicitamente impostato a zero dall'editor avanzato. I
 * consumer downstream (bar-shift, inventory) usano `Number(qty) || 0`
 * quindi null si comporta come 0 nei calcoli aggregati.
 *
 * Nessun backfill 0→NULL: il dato storico non distingue le due cause
 * (quick-form vs explicit zero); rispettiamo i valori esistenti.
 *
 * Idempotente: se la colonna gia' permette NULL, no-op.
 */

async function hasColumn(knex, tableName, columnName) {
  if (!(await knex.schema.hasTable(tableName))) return false;
  return knex.schema.hasColumn(tableName, columnName);
}

module.exports = {
  async up(knex) {
    if (!(await hasColumn(knex, 'element_ingredients', 'qty_per_serving'))) {
      console.log('[qty_per_serving_nullable] colonna assente, skip.');
      return;
    }

    try {
      await knex.raw(`ALTER TABLE element_ingredients ALTER COLUMN qty_per_serving DROP NOT NULL`);
    } catch (err) {
      const msg = String(err && err.message ? err.message : '').toLowerCase();
      // SQLite o colonna gia' nullable: ignora.
      if (!msg.includes('does not exist') && !msg.includes('is not null') && !msg.includes('no null') && !msg.includes('syntax error')) {
        throw err;
      }
    }

    try {
      await knex.raw(`ALTER TABLE element_ingredients ALTER COLUMN qty_per_serving DROP DEFAULT`);
    } catch (err) {
      const msg = String(err && err.message ? err.message : '').toLowerCase();
      if (!msg.includes('does not exist') && !msg.includes('no default') && !msg.includes('syntax error')) {
        throw err;
      }
    }

    console.log('[qty_per_serving_nullable] colonna element_ingredients.qty_per_serving ora nullable, default rimosso.');
  },

  async down(knex) {
    // Rollback: ripristina default 0 e NOT NULL. Backfill di sicurezza
    // sostituisce eventuali NULL con 0 prima di riapplicare il vincolo.
    if (!(await hasColumn(knex, 'element_ingredients', 'qty_per_serving'))) return;

    await knex.raw(`UPDATE element_ingredients SET qty_per_serving = 0 WHERE qty_per_serving IS NULL`);
    try {
      await knex.raw(`ALTER TABLE element_ingredients ALTER COLUMN qty_per_serving SET DEFAULT 0`);
      await knex.raw(`ALTER TABLE element_ingredients ALTER COLUMN qty_per_serving SET NOT NULL`);
    } catch (err) {
      const msg = String(err && err.message ? err.message : '').toLowerCase();
      if (!msg.includes('syntax error')) throw err;
    }
  },
};
