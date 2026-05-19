'use strict';

/**
 * Introduce 'pending' come stato iniziale di OrderItem per separare
 * "preso dal cameriere, NON ancora in cucina" da "arrivato in cucina,
 * da fare" (taken).
 *
 * Nuovo FSM dine-in:
 *   pending → taken → preparing → ready → served
 *   ^         ^         ^          ^        ^
 *   cameriere invia    cucina     cucina   cameriere
 *   solo      in cuc.  inizia     pronto   servito
 *
 * Per il flow takeaway (gating al livello Order.takeaway_status) il valore
 * 'pending' non viene usato: gli item takeaway continuano a partire da
 * 'taken'. La distinzione e' a livello applicativo nel controller.
 *
 * Migration steps:
 *   1. PG: rilassa la CHECK constraint del enum di Strapi (drop + recreate
 *      con il nuovo valore). Strapi v5 al boot sincronizza la column type
 *      ma in alcuni casi non aggiorna il CHECK; lo droppiamo difensivamente.
 *   2. ALTER COLUMN ... SET DEFAULT 'pending'.
 *
 * Nessun backfill 0→pending: le righe esistenti 'taken' restano (erano
 * "post-send" nel vecchio flusso), idem 'preparing'/'ready'/'served'.
 *
 * Idempotente: la query lookup del CHECK constraint salta se non esiste.
 * SQLite e MySQL non hanno bisogno di intervento sul CHECK (enumeration
 * gestita via app-level o type-level).
 */

async function hasTable(knex, name) {
  return knex.schema.hasTable(name);
}

async function dropPgCheckConstraint(knex, tableName, constraintLike) {
  // Postgres only: trova qualunque CHECK su `tableName` che menzioni `status`
  // e droppalo. Strapi al boot ricrea il check con i nuovi valori dell'enum.
  try {
    const rows = await knex.raw(`
      SELECT conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = ?
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ILIKE ?
    `, [tableName, `%${constraintLike}%`]);
    const list = (rows && rows.rows) || [];
    for (const r of list) {
      await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [tableName, r.conname]);
      console.log(`[order_item_pending_status] dropped CHECK ${r.conname} su ${tableName}`);
    }
  } catch (err) {
    const msg = String(err && err.message ? err.message : '').toLowerCase();
    // Non-Postgres dialect → ignora silenziosamente.
    if (!msg.includes('syntax error') && !msg.includes('no such table') && !msg.includes('pg_constraint')) {
      console.warn(`[order_item_pending_status] dropPgCheckConstraint: ${err.message}`);
    }
  }
}

module.exports = {
  async up(knex) {
    if (!(await hasTable(knex, 'order_items'))) {
      console.log('[order_item_pending_status] tabella assente, skip.');
      return;
    }

    // 1) Rilassa CHECK su status (PG). Strapi sync ricrea con i nuovi valori.
    await dropPgCheckConstraint(knex, 'order_items', 'status');

    // 2) Aggiorna il DEFAULT della colonna status.
    try {
      await knex.raw(`ALTER TABLE order_items ALTER COLUMN status SET DEFAULT 'pending'`);
    } catch (err) {
      const msg = String(err && err.message ? err.message : '').toLowerCase();
      // SQLite non supporta SET DEFAULT inline su ALTER COLUMN — il default
      // applicativo lo gestisce il controller, accettabile come fallback.
      if (!msg.includes('syntax error') && !msg.includes('near "alter"') && !msg.includes('cannot add')) {
        throw err;
      }
    }

    console.log('[order_item_pending_status] enum aggiornato (pending aggiunto), default = pending.');
  },

  async down(knex) {
    if (!(await hasTable(knex, 'order_items'))) return;

    // Rollback: backfill pending → taken, ripristina default a 'taken'.
    await knex.raw(`UPDATE order_items SET status = 'taken' WHERE status = 'pending'`);
    try {
      await knex.raw(`ALTER TABLE order_items ALTER COLUMN status SET DEFAULT 'taken'`);
    } catch (err) {
      const msg = String(err && err.message ? err.message : '').toLowerCase();
      if (!msg.includes('syntax error')) throw err;
    }
    // Il CHECK constraint viene ricreato da Strapi al prossimo boot.
  },
};
