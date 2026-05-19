'use strict';

/**
 * Garantisce in produzione le colonne flag di Element dichiarate nello schema
 * Strapi ma usate anche da migration/runtime prima che il diff automatico
 * possa essere considerato affidabile.
 */

async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function hasColumn(knex, tableName, columnName) {
  if (!(await hasTable(knex, tableName))) return false;
  return knex.schema.hasColumn(tableName, columnName);
}

async function addBooleanColumnIfMissing(knex, tableName, columnName) {
  if (!(await hasTable(knex, tableName))) return;
  if (await hasColumn(knex, tableName, columnName)) return;

  try {
    await knex.schema.alterTable(tableName, (table) => {
      table.boolean(columnName).defaultTo(false);
    });
  } catch (error) {
    const msg = String(error && error.message ? error.message : error).toLowerCase();
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
    await addBooleanColumnIfMissing(knex, 'elements', 'is_beverage');
    await addBooleanColumnIfMissing(knex, 'elements', 'is_beverage_advanced');
    await addBooleanColumnIfMissing(knex, 'elements', 'is_archived');

    await addIndexIfMissing(knex, 'elements', ['is_beverage'], 'idx_elements_is_beverage');
    await addIndexIfMissing(knex, 'elements', ['is_archived'], 'idx_elements_is_archived');
  },

  async down() {
    // One-way: questi flag fanno parte dello schema Element corrente.
  },
};
