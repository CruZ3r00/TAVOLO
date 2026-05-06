'use strict';

/**
 * Finalizza la chiusura di un ordine DOPO che il pagamento è stato
 * autorizzato (simulato o confermato da un device fiscale). Estratto dal
 * controller `api::order.order#close` per poter essere invocato anche
 * dall'handler di ack di pos-device (flow asincrono).
 *
 * Responsabilità:
 *   - aggiorna order (status, closed_at, total_amount, payment_*, lock_version, fiscal_*)
 *   - libera il tavolo (status=free) e chiude reservation se collegata
 *   - invoca stats/archive (fail-soft)
 *
 * Tutto in un'unica transazione con retry (stesso pattern ADR-0002.7).
 */

const statsService = require('../stats');
const { withRetry, getDialect, isSqlite } = require('../../utils/db-lock');

async function lockOrderRow(trx, orderId, dialect) {
  if (isSqlite(dialect)) return;
  await trx.raw('SELECT id FROM orders WHERE id = ? FOR UPDATE', [orderId]);
}

async function beginImmediate(trx, dialect) {
  if (!isSqlite(dialect)) return;
  try {
    await trx.raw('BEGIN IMMEDIATE');
  } catch (_e) {
    /* may already be IMMEDIATE */
  }
}

/**
 * @param {object} p
 * @param {object} p.strapi
 * @param {object} p.order         — ordine caricato con populate
 * @param {Array}  p.items         — order.fk_items (con quantità)
 * @param {object} p.totalResult   — { total, subtotal, tax, discount } derivato
 * @param {object} p.paymentResult — { transactionId, timestamp, ... }
 * @param {string} p.paymentMethod — simulator|pos|fiscal_register
 * @param {number} p.userId
 * @param {object} [p.fiscal]      — { status?: 'completed'|'failed'|'not_required', receipt_id?, event_id? }
 */
async function finalize({
  strapi,
  order,
  items,
  totalResult,
  paymentResult,
  paymentMethod,
  userId,
  fiscal = {},
}) {
  const dialect = getDialect(strapi);
  const documentId = order.documentId;

  await withRetry(
    async () =>
      strapi.db.transaction(async ({ trx }) => {
        await beginImmediate(trx, dialect);
        await lockOrderRow(trx, order.id, dialect);

        const orderRows = await trx('orders').where({ id: order.id }).select('status', 'lock_version');
        if (orderRows.length === 0) {
          const err = new Error('Ordine non trovato.');
          err._resCode = 'ORDER_NOT_FOUND';
          throw err;
        }
        // Se l'ordine risulta già chiuso, siamo in idempotenza lato ack
        const dbRow = orderRows[0];
        if (dbRow.status === 'closed') {
          return; // no-op idempotente
        }

        const closedAtISO = new Date().toISOString();

        const updateData = {
          status: 'closed',
          closed_at: closedAtISO,
          total_amount: totalResult.total,
          payment_status: 'paid',
          payment_reference: paymentResult.transactionId,
          lock_version: (order.lock_version || 0) + 1,
        };
        if (fiscal.status) updateData.fiscal_status = fiscal.status;
        if (fiscal.receipt_id !== undefined) updateData.fiscal_receipt_id = fiscal.receipt_id;
        if (fiscal.event_id !== undefined) updateData.fiscal_event_id = fiscal.event_id;
        if (order.service_type === 'takeaway') updateData.takeaway_status = 'closed';

        await strapi.documents('api::order.order').update({
          documentId,
          data: updateData,
        });

        if (order.fk_table) {
          await strapi.documents('api::table.table').update({
            documentId: order.fk_table.documentId,
            data: { status: 'free' },
          });
        }

        if (order.fk_reservation && order.fk_reservation.documentId) {
          const resStatus = order.fk_reservation.status;
          if (resStatus !== 'completed' && resStatus !== 'cancelled') {
            await strapi.documents('api::reservation.reservation').update({
              documentId: order.fk_reservation.documentId,
              data: { status: 'completed' },
            });
          }
        }

        // Archive + stats
        try {
          const closedOrder = {
            documentId,
            opened_at: order.opened_at,
            closed_at: closedAtISO,
            total_amount: totalResult.total,
            covers: order.covers || null,
            service_type: order.service_type || 'table',
            customer_name: order.customer_name || null,
            customer_phone: order.customer_phone || null,
            customer_email: order.customer_email || null,
            pickup_at: order.pickup_at || null,
          };
          const reservation = order.fk_reservation || null;
          const table = order.fk_table || null;

          await statsService.archiveClosedOrder(strapi, {
            order: closedOrder,
            items,
            reservation,
            table,
            paymentMethod,
            paymentReference: paymentResult.transactionId,
            userId,
            isWalkin: reservation ? !!reservation.is_walkin : false,
            isTakeaway: order.service_type === 'takeaway',
          });

          const dateKey = statsService.dateKeyUTC(closedAtISO);
          const customersCount =
            (order.covers
              ? parseInt(order.covers, 10)
              : reservation
                ? parseInt(reservation.number_of_people, 10)
                : 0) || 0;
          const itemsCount = (items || []).reduce(
            (s, it) => s + (parseInt(it.quantity, 10) || 0),
            0,
          );

          await statsService.updateDailyStat(strapi, {
            userId,
            dateKey,
            revenue: totalResult.total,
            customers: customersCount,
            items: itemsCount,
            isWalkin: reservation ? !!reservation.is_walkin : false,
            hasReservation: !!reservation && !reservation.is_walkin,
            isTakeaway: order.service_type === 'takeaway',
          });

          await statsService.updateElementStats(strapi, {
            userId,
            items,
            timestamp: closedAtISO,
          });
        } catch (statsErr) {
          strapi.log.error('stats/archive failure durante finalize-close', statsErr);
          throw statsErr;
        }
      }),
    { maxAttempts: 3 },
  ).catch((err) => {
    if (err && err._resCode) throw err;
    const wrapped = new Error('Contesa DB, riprova.');
    wrapped._resCode = 'ORDER_CONTENTION';
    throw wrapped;
  });
}

/**
 * Setta fiscal_status=failed sull'ordine (quando il device fallisce
 * definitivamente dopo DLQ). Non chiude l'ordine — il ristoratore può
 * ritentare manualmente con payment_method=simulator.
 */
async function markFiscalFailed({ strapi, orderDocumentId, errorCode, errorMessage }) {
  try {
    await strapi.documents('api::order.order').update({
      documentId: orderDocumentId,
      data: {
        fiscal_status: 'failed',
      },
    });
    strapi.log.warn(
      `order ${orderDocumentId} → fiscal_status=failed (${errorCode}: ${errorMessage})`,
    );
  } catch (err) {
    strapi.log.error(
      `markFiscalFailed: update ordine ${orderDocumentId} fallito: ${err.message}`,
    );
  }
}

module.exports = { finalize, markFiscalFailed };
