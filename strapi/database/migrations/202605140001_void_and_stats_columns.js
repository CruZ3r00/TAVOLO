'use strict';

/**
 * Aggiunta colonne per FASE 5 (voided OrderItem) + FASE 3 (served_at) +
 * voided_count / voided_revenue_lost su RestaurantDailyStat.
 *
 * Strapi v5 in dev (`npm run dev`) sincronizza automaticamente le colonne
 * dagli schema.json, ma in produzione su Supabase si parte da `npm run start`
 * (che esegue le migrazioni knex ma NON applica diff arbitrari). Questa
 * migrazione esplicita garantisce che le colonne esistano sia in locale
 * che in produzione, in modo idempotente.
 *
 * Tabelle interessate:
 *   - order_items.voided           (boolean, default false)
 *   - order_items.voided_reason    (text)
 *   - order_items.voided_at        (timestamp)
 *   - order_items.served_at        (timestamp)
 *   - restaurant_daily_stats.voided_count        (integer, default 0)
 *   - restaurant_daily_stats.voided_revenue_lost (decimal, default 0)
 *
 * Nota: la migrazione che crea l'indice `idx_order_items_voided`
 * (202605130001) usa `hasColumn` come guardia, quindi a deploy
 * questa migrazione deve venire prima (timestamp 202605140001 > prima del
 * re-run dell'indice; knex traccia le migrazioni gia eseguite e l'index e'
 * comunque idempotente — vedi `addIndex` in 202605130001).
 */

async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function hasColumn(knex, tableName, columnName) {
  if (!(await hasTable(knex, tableName))) return false;
  return knex.schema.hasColumn(tableName, columnName);
}

async function addColumnIfMissing(knex, tableName, columnName, builder) {
  if (!(await hasTable(knex, tableName))) return;
  if (await hasColumn(knex, tableName, columnName)) return;
  try {
    await knex.schema.alterTable(tableName, (table) => builder(table));
  } catch (error) {
    const msg = String(error && error.message ? error.message : error).toLowerCase();
    // Race / re-run safety
    if (msg.includes('duplicate') || msg.includes('already exists') || msg.includes('exists')) return;
    throw error;
  }
}

async function addIndexIfMissing(knex, tableName, columns, indexName) {
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
    // -------- order_items: voided FSM + served_at --------
    await addColumnIfMissing(knex, 'order_items', 'voided', (table) => {
      table.boolean('voided').notNullable().defaultTo(false);
    });
    await addColumnIfMissing(knex, 'order_items', 'voided_reason', (table) => {
      table.text('voided_reason').nullable();
    });
    await addColumnIfMissing(knex, 'order_items', 'voided_at', (table) => {
      table.timestamp('voided_at', { useTz: true }).nullable();
    });
    await addColumnIfMissing(knex, 'order_items', 'served_at', (table) => {
      table.timestamp('served_at', { useTz: true }).nullable();
    });

    // -------- restaurant_daily_stats: void accounting --------
    await addColumnIfMissing(knex, 'restaurant_daily_stats', 'voided_count', (table) => {
      table.integer('voided_count').notNullable().defaultTo(0);
    });
    await addColumnIfMissing(knex, 'restaurant_daily_stats', 'voided_revenue_lost', (table) => {
      table.decimal('voided_revenue_lost', 12, 2).notNullable().defaultTo(0);
    });

    // -------- Indici dipendenti dalle colonne appena create --------
    // La migrazione 202605130001 dichiarava questo indice ma lo skippava
    // se la colonna non esisteva. Lo aggiungiamo ora che la colonna c'e'.
    await addIndexIfMissing(knex, 'order_items', ['voided', 'voided_at'], 'idx_order_items_voided');
  },

  async down() {
    // Migrazione one-way: queste colonne sono parte del modello operativo.
    // Drop su rollback rischia perdita dati di audit (voided/voided_reason).
  },
};
