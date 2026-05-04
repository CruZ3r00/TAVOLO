'use strict';

/**
 * Campi operativi per dividere gli item ordine per categoria e portata.
 * Idempotente: puo girare anche su DB gia sincronizzati da Strapi.
 */

async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function hasColumn(knex, tableName, columnName) {
  if (!(await hasTable(knex, tableName))) return false;
  return knex.schema.hasColumn(tableName, columnName);
}

module.exports = {
  /**
   * @param {import('knex').Knex} knex
   */
  async up(knex) {
    if (!(await hasTable(knex, 'order_items'))) return;

    const addCategory = !(await hasColumn(knex, 'order_items', 'category'));
    const addCourse = !(await hasColumn(knex, 'order_items', 'course'));

    if (!addCategory && !addCourse) return;

    await knex.schema.alterTable('order_items', (table) => {
      if (addCategory) {
        table.string('category', 100).nullable();
      }
      if (addCourse) {
        table.integer('course').notNullable().defaultTo(1);
      }
    });
  },

  /**
   * @param {import('knex').Knex} knex
   */
  async down(knex) {
    if (!(await hasTable(knex, 'order_items'))) return;

    const dropCategory = await hasColumn(knex, 'order_items', 'category');
    const dropCourse = await hasColumn(knex, 'order_items', 'course');

    if (!dropCategory && !dropCourse) return;

    await knex.schema.alterTable('order_items', (table) => {
      if (dropCategory) {
        table.dropColumn('category');
      }
      if (dropCourse) {
        table.dropColumn('course');
      }
    });
  },
};
