'use strict';

/**
 * Indici operativi per query multi-tenant, prenotazioni e ordini.
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
    await addIndex(knex, 'menus_fk_user_lnk', ['user_id'], 'idx_menus_user');
    await addIndex(knex, 'elements_fk_user_lnk', ['user_id'], 'idx_elements_user');
    await addIndex(knex, 'tables_fk_user_lnk', ['user_id'], 'idx_tables_user');
    await addIndex(knex, 'orders_fk_user_lnk', ['user_id'], 'idx_orders_user');
    await addIndex(knex, 'orders_fk_table_lnk', ['table_id'], 'idx_orders_table');
    await addIndex(knex, 'reservations_fk_user_lnk', ['user_id'], 'idx_reservations_user');
    await addIndex(knex, 'website_configs_fk_user_lnk', ['user_id'], 'idx_website_configs_user');

    await addIndex(knex, 'reservations', ['slot_start', 'status'], 'idx_reservations_slot_status');
    await addIndex(knex, 'reservations', ['datetime', 'status'], 'idx_reservations_datetime_status');
    await addIndex(knex, 'orders', ['status', 'opened_at'], 'idx_orders_status_opened');
    await addIndex(knex, 'tables', ['number', 'status'], 'idx_tables_number_status');
    await addIndex(knex, 'restaurant_daily_stats', ['date'], 'idx_daily_stats_date');
  },
};
