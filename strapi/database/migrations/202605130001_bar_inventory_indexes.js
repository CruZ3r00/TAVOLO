'use strict';

/**
 * Indici operativi per il modulo Bar + Magazzino avanzato (FASE 0).
 *
 * Le tabelle base (`bar_shifts`, `ingredients`, `element_ingredients`,
 * `inventory_movements`, `restock_orders`, `inventory_alerts`) sono create
 * automaticamente da Strapi a partire dai content type schema.json.
 *
 * Qui aggiungiamo solo gli indici che Strapi non genera in automatico:
 *   - bar_shifts(status, opened_at desc) — "turno aperto" + history
 *   - bar_shifts(closed_at desc)         — paginazione storico
 *   - ingredients(name_normalized)       — find-by-name veloce
 *   - ingredients(is_active)             — filtri lista pro
 *   - inventory_movements(kind, id desc) — query per tipo append-only
 *   - restock_orders(status)             — filtro pending
 *   - inventory_alerts(acknowledged_at)  — filtro unread
 *   - element_ingredients(qty_per_serving) — utile su PG per ordinamento
 *
 * L'unicita applicativa `(fk_user, name_normalized)` su ingredients e
 * `(fk_user) WHERE status='open'` su bar_shifts sono enforced via service
 * layer con `SELECT FOR UPDATE` + retry (pattern `db-lock.js`).
 *
 * Tutti i CREATE INDEX sono idempotenti (try/catch su duplicate/exists).
 */

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
    // bar_shifts: il filtro "turno aperto" + history paginato
    await addIndex(knex, 'bar_shifts', ['status', 'opened_at'], 'idx_bar_shifts_status_opened');
    await addIndex(knex, 'bar_shifts', ['closed_at'], 'idx_bar_shifts_closed_at');

    // ingredients: lookup per nome normalizzato (find-or-create) e filtro lista
    await addIndex(knex, 'ingredients', ['name_normalized'], 'idx_ingredients_name_normalized');
    await addIndex(knex, 'ingredients', ['is_active'], 'idx_ingredients_is_active');

    // element_ingredients: ordinamento + scan rapido (FK indices sono in *_lnk)
    await addIndex(knex, 'element_ingredients', ['qty_per_serving'], 'idx_element_ingredients_qty');

    // inventory_movements: append-only, query per tipo
    await addIndex(knex, 'inventory_movements', ['kind'], 'idx_inventory_movements_kind');

    // restock_orders: filtro per status (pending)
    await addIndex(knex, 'restock_orders', ['status'], 'idx_restock_orders_status');

    // inventory_alerts: filtro unread
    await addIndex(knex, 'inventory_alerts', ['acknowledged_at'], 'idx_inventory_alerts_ack');
    await addIndex(knex, 'inventory_alerts', ['alert_type', 'acknowledged_at'], 'idx_inventory_alerts_type_ack');

    // order_items: filtro voided per report errori
    await addIndex(knex, 'order_items', ['voided', 'voided_at'], 'idx_order_items_voided');

    // elements: filtro archiviati (escludi dal public menu + gestione menu)
    await addIndex(knex, 'elements', ['is_archived'], 'idx_elements_is_archived');
    await addIndex(knex, 'elements', ['is_beverage'], 'idx_elements_is_beverage');
  },

  async down() {
    // Indici operativi idempotenti: li lasciamo per non degradare le query live.
  },
};
