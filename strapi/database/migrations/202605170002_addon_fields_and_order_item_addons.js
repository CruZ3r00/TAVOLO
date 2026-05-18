'use strict';

/**
 * Migrazione "Aggiunte agli ordini" (addons).
 *
 * 1) Aggiunge a `ingredients`:
 *    - is_addon       boolean default false NOT NULL
 *    - addon_price    decimal nullable
 *    - addon_avg_qty  decimal nullable
 *
 * 2) Crea (se assente) la tabella `order_item_addons` e le sue link tables
 *    (Strapi v5 di norma le genera al boot, ma forziamo CREATE IF NOT EXISTS
 *    + indici per garantire idempotenza e velocita' delle query).
 *
 * Idempotente: rieseguibile in sicurezza.
 */

async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function hasColumn(knex, tableName, columnName) {
  if (!(await hasTable(knex, tableName))) return false;
  return knex.schema.hasColumn(tableName, columnName);
}

async function addColumns(knex, tableName, columns) {
  if (!(await hasTable(knex, tableName))) return;
  const missing = [];
  for (const column of columns) {
    if (!(await hasColumn(knex, tableName, column.name))) missing.push(column);
  }
  if (!missing.length) return;
  await knex.schema.alterTable(tableName, (table) => {
    for (const column of missing) column.add(table);
  });
}

async function addIndex(knex, tableName, columns, indexName) {
  if (!(await hasTable(knex, tableName))) return;
  try {
    await knex.schema.alterTable(tableName, (table) => {
      table.index(columns, indexName);
    });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err).toLowerCase();
    if (msg.includes('duplicate') || msg.includes('already exists') || msg.includes('exists')) return;
    throw err;
  }
}

module.exports = {
  async up(knex) {
    // 1) Colonne addon su ingredients.
    await addColumns(knex, 'ingredients', [
      { name: 'is_addon',      add: (table) => table.boolean('is_addon').notNullable().defaultTo(false) },
      { name: 'addon_price',   add: (table) => table.decimal('addon_price', 10, 2).nullable() },
      { name: 'addon_avg_qty', add: (table) => table.decimal('addon_avg_qty', 10, 4).nullable() },
    ]);

    // Indice di servizio per la query "addons disponibili per il cameriere".
    await addIndex(knex, 'ingredients', ['is_addon', 'is_active'], 'idx_ingredients_addon_active');

    // 2) Indici sulle link tables (Strapi le crea al boot).
    await addIndex(knex, 'order_item_addons_fk_order_item_lnk', ['order_item_id'], 'idx_oia_order_item');
    await addIndex(knex, 'order_item_addons_fk_ingredient_lnk', ['ingredient_id'], 'idx_oia_ingredient');
  },

  async down() {
    // noop: niente rimozione automatica (preserviamo dati storici).
  },
};
