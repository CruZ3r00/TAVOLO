'use strict';

async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function hasColumn(knex, tableName, columnName) {
  if (!(await hasTable(knex, tableName))) return false;
  return knex.schema.hasColumn(tableName, columnName);
}

async function addIndex(knex, tableName, columns, indexName) {
  if (!(await hasTable(knex, tableName))) return;
  for (const column of columns) {
    if (!(await hasColumn(knex, tableName, column))) return;
  }

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
  async up(knex) {
    await addIndex(knex, 'orders', ['status', 'service_type', 'takeaway_status', 'opened_at'], 'idx_orders_station_status_service');
    await addIndex(knex, 'orders', ['status', 'sent_to_departments_at', 'takeaway_status'], 'idx_orders_takeaway_departments');
    await addIndex(knex, 'order_items', ['status', 'category'], 'idx_order_items_status_category');
    await addIndex(knex, 'order_items_fk_order_lnk', ['order_id'], 'idx_order_items_lnk_order');
    await addIndex(knex, 'order_items_fk_order_lnk', ['order_item_id'], 'idx_order_items_lnk_item');
    await addIndex(knex, 'orders_fk_user_lnk', ['user_id', 'order_id'], 'idx_orders_user_order');
    if (
      String(knex.client.config.client).includes('pg') &&
      (await hasTable(knex, 'order_items')) &&
      (await hasColumn(knex, 'order_items', 'category'))
    ) {
      await knex.raw('create index if not exists idx_order_items_category_key on order_items ((lower(btrim(category))))');
    }
  },

  async down() {
    // Indici operativi idempotenti: li lasciamo per non degradare le query live.
  },
};
