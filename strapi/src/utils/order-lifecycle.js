'use strict';

/**
 * Helper condivisi per il ciclo di vita di Order/Reservation/Table.
 *
 * `openOrderForTableTx` apre atomicamente un ordine su un tavolo verificando
 * che:
 *  - il tavolo appartenga all'utente,
 *  - il tavolo sia libero,
 *  - non ci siano ordini attivi su quel tavolo.
 *
 * Aggiorna `table.status = 'occupied'` e restituisce il documento Order
 * creato (tramite strapi.documents). La funzione DEVE essere chiamata
 * dentro una transazione Knex; i lock devono essere acquisiti prima
 * (vedi `db-lock.js`).
 *
 * Usato sia da `POST /api/orders` (legacy / dashboard) che dai nuovi
 * endpoint `POST /api/reservations/:documentId/seat` e
 * `POST /api/reservations/walkin`.
 */

const { errors } = require('@strapi/utils');
const { isSqlite, lockTable } = require('./db-lock');

const { ApplicationError } = errors;

function appError(code, message, details) {
  const err = new ApplicationError(message, details ? { code, details } : { code });
  err._resCode = code;
  return err;
}

/**
 * @param {object} params
 * @param {import('knex').Knex.Transaction} params.trx
 * @param {number} params.userId
 * @param {string} params.tableDocumentId
 * @param {number|null} [params.covers]
 * @param {number|null} [params.reservationId]  ID numerico (non documentId) della reservation da linkare.
 * @param {string} params.dialect
 * @returns {Promise<object>} order document (già con lock_version 0).
 */
async function openOrderForTableTx({ trx, userId, tableDocumentId, covers, reservationId, dialect }) {
  if (!tableDocumentId) throw appError('INVALID_PAYLOAD', 'table_id obbligatorio.');

  const tableRows = await trx('tables as t')
    .leftJoin('tables_fk_user_lnk as lnk', 'lnk.table_id', 't.id')
    .where('t.document_id', tableDocumentId)
    .limit(1)
    .select('t.id as id', 't.document_id as document_id', 't.status as status', 'lnk.user_id as user_id');

  if (!tableRows || tableRows.length === 0) {
    throw appError('TABLE_NOT_FOUND', 'Tavolo non trovato.');
  }
  const tbl = tableRows[0];
  if (tbl.user_id !== userId) {
    throw appError('NOT_OWNER', 'Non autorizzato su questo tavolo.');
  }

  await lockTable(trx, tbl.id, dialect);

  if (tbl.status === 'occupied') {
    throw appError('TABLE_ALREADY_OCCUPIED', 'Tavolo gia occupato.');
  }

  const activeOrders = await trx('orders as o')
    .innerJoin('orders_fk_table_lnk as tl', 'tl.order_id', 'o.id')
    .innerJoin('orders_fk_user_lnk as ul', 'ul.order_id', 'o.id')
    .where('tl.table_id', tbl.id)
    .andWhere('ul.user_id', userId)
    .andWhere('o.status', 'active')
    .select('o.id as id');
  if (activeOrders.length > 0) {
    throw appError('TABLE_ALREADY_OCCUPIED', 'Esiste gia un ordine attivo su questo tavolo.');
  }

  const data = {
    status: 'active',
    service_type: 'table',
    opened_at: new Date().toISOString(),
    total_amount: 0,
    payment_status: 'unpaid',
    lock_version: 0,
    covers: covers || null,
    fk_table: { connect: [{ id: tbl.id }] },
    fk_user: { connect: [{ id: userId }] },
  };
  if (reservationId) {
    data.fk_reservation = { connect: [{ id: reservationId }] };
  }

  const orderDoc = await strapi.documents('api::order.order').create({ data });

  await strapi.documents('api::table.table').update({
    documentId: tbl.document_id,
    data: { status: 'occupied' },
  });

  return { order: orderDoc, tableId: tbl.id };
}

module.exports = {
  appError,
  openOrderForTableTx,
  isSqlite,
};
