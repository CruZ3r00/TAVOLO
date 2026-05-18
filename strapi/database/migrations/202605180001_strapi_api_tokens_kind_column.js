'use strict';

/**
 * Aggiunge la colonna `kind` a `strapi_api_tokens` se mancante.
 *
 * Motivazione: il DB e' stato creato con una versione di Strapi precedente
 * all'introduzione del campo `kind` (Strapi v4.6+ / v5). Strapi internamente,
 * nel middleware di fallback API-token, fa una SELECT che include `kind`.
 * Se la colonna non esiste, l'errore SQL "column t0.kind does not exist"
 * fa crashare con 500 qualunque richiesta autenticata su Postgres.
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

async function ensureKindColumn(knex, table) {
  if (!(await hasTable(knex, table))) return;
  if (await hasColumn(knex, table, 'kind')) return;
  await knex.schema.alterTable(table, (t) => {
    // 'custom' e' il default scelto da Strapi per i token preesistenti.
    t.string('kind', 32).notNullable().defaultTo('custom');
  });
}

module.exports = {
  async up(knex) {
    await ensureKindColumn(knex, 'strapi_api_tokens');
    // Stessa correzione per i transfer tokens (analoga in Strapi v5).
    await ensureKindColumn(knex, 'strapi_transfer_tokens');
  },

  async down() {
    // noop: la colonna serve a Strapi a runtime, non la rimuoviamo.
  },
};
