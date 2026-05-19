'use strict';

/**
 * Indice su fk_user per la tabella restaurant_printer_configs.
 * Singleton per utente: l'indice velocizza la lookup in findMe/loadForUser.
 */

async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function addIndex(knex, tableName, columns, indexName) {
  if (!(await hasTable(knex, tableName))) return;
  try {
    await knex.schema.alterTable(tableName, (table) => {
      table.index(columns, indexName);
    });
  } catch (error) {
    const msg = String(error && error.message ? error.message : error).toLowerCase();
    if (msg.includes('duplicate') || msg.includes('already exists') || msg.includes('exists')) return;
    throw error;
  }
}

module.exports = {
  /**
   * @param {import('knex').Knex} knex
   */
  async up(knex) {
    // Strapi crea la link table per la relazione oneToOne: restaurant_printer_configs_fk_user_lnk
    await addIndex(
      knex,
      'restaurant_printer_configs_fk_user_lnk',
      ['user_id'],
      'idx_restaurant_printer_configs_user',
    );
  },

  async down() {
    // noop: non rimuoviamo indici in down
  },
};
