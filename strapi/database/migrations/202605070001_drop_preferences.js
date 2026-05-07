'use strict';

/**
 * Drop deprecato content-type `api::preference.preference`.
 *
 * Storia: era usato per memorizzare colori/tema del menu pubblico.
 * Sostituito dal flusso attuale (siti vetrina prodotti esternamente
 * e pushati in `restaurant-sites/`).
 *
 * Rimuove:
 *   - tabella `preferences`
 *   - tabella di link `up_users_fk_prefs_lnk` (relation oneToOne)
 *
 * Idempotente: i `DROP TABLE IF EXISTS ... CASCADE` non falliscono se
 * la tabella è già stata rimossa.
 */

async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

module.exports = {
  async up(knex) {
    if (await hasTable(knex, 'up_users_fk_prefs_lnk')) {
      await knex.raw('DROP TABLE IF EXISTS public.up_users_fk_prefs_lnk CASCADE');
    }
    if (await hasTable(knex, 'preferences')) {
      await knex.raw('DROP TABLE IF EXISTS public.preferences CASCADE');
    }
  },

  async down() {
    // Irreversibile: il content-type è stato rimosso dal codebase.
  },
};
