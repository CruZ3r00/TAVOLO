'use strict';

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
    for (const column of missing) {
      column.add(table);
    }
  });
}

module.exports = {
  async up(knex) {
    await addColumns(knex, 'orders', [
      { name: 'service_type', add: (table) => table.string('service_type', 32).notNullable().defaultTo('table') },
      { name: 'takeaway_status', add: (table) => table.string('takeaway_status', 40).nullable() },
      { name: 'customer_name', add: (table) => table.string('customer_name', 120).nullable() },
      { name: 'customer_phone', add: (table) => table.string('customer_phone', 32).nullable() },
      { name: 'customer_email', add: (table) => table.string('customer_email', 255).nullable() },
      { name: 'pickup_at', add: (table) => table.datetime('pickup_at').nullable() },
      { name: 'sent_to_departments_at', add: (table) => table.datetime('sent_to_departments_at').nullable() },
      { name: 'ready_at', add: (table) => table.datetime('ready_at').nullable() },
      { name: 'picked_up_at', add: (table) => table.datetime('picked_up_at').nullable() },
    ]);

    await addColumns(knex, 'reservations', [
      { name: 'customer_email', add: (table) => table.string('customer_email', 255).nullable() },
    ]);

    await addColumns(knex, 'order_archives', [
      { name: 'service_type', add: (table) => table.string('service_type', 32).notNullable().defaultTo('table') },
      { name: 'customer_phone', add: (table) => table.string('customer_phone', 32).nullable() },
      { name: 'customer_email', add: (table) => table.string('customer_email', 255).nullable() },
      { name: 'pickup_at', add: (table) => table.datetime('pickup_at').nullable() },
    ]);

    await addColumns(knex, 'restaurant_daily_stats', [
      { name: 'takeaway_count', add: (table) => table.integer('takeaway_count').notNullable().defaultTo(0) },
    ]);

    if (await hasTable(knex, 'orders')) {
      try {
        await knex.schema.alterTable('orders', (table) => {
          table.index(['service_type', 'status', 'pickup_at'], 'idx_orders_service_status_pickup');
        });
      } catch (err) {
        const msg = String(err && err.message ? err.message : err).toLowerCase();
        if (!msg.includes('duplicate') && !msg.includes('exists')) throw err;
      }
    }
  },

  async down(knex) {
    // Irreversibile in sicurezza: lasciamo i campi per non perdere storico/fiscale.
  },
};
