'use strict';

/**
 * Calcolo conto ordine.
 *
 * `computeTotal` e' design-ready per IVA/sconti (v2).
 * In v1 taxRate = 0 e discounts = [], quindi total === subtotal.
 *
 * `recalculateTotal` legge gli items dal DB, ricalcola e persiste
 * il totale aggiornato sull'ordine. Deve essere chiamato dopo ogni
 * add/update/delete item.
 *
 * Vedi ADR-0002.6 per le motivazioni.
 */

/**
 * Calcola il totale di un ordine a partire dagli items.
 *
 * @param {object} params
 * @param {Array<{price: number|string, quantity: number|string}>} params.items
 * @param {number} [params.taxRate=0] aliquota IVA (0..1)
 * @param {Array<{amount: number}>} [params.discounts=[]] lista sconti
 * @returns {{ subtotal: number, tax: number, discount: number, total: number }}
 */
function computeTotal({ items, taxRate, discounts }) {
  const subtotal = (items || []).reduce((sum, item) => {
    const p = parseFloat(item.price) || 0;
    const q = parseInt(item.quantity, 10) || 0;
    return sum + p * q;
  }, 0);

  const roundedSubtotal = Math.round(subtotal * 100) / 100;

  const tax = taxRate ? Math.round(roundedSubtotal * taxRate * 100) / 100 : 0;

  const discount = Array.isArray(discounts)
    ? discounts.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0)
    : 0;
  const roundedDiscount = Math.round(discount * 100) / 100;

  const total = Math.round((roundedSubtotal + tax - roundedDiscount) * 100) / 100;

  return {
    subtotal: roundedSubtotal,
    tax,
    discount: roundedDiscount,
    total: Math.max(0, total),
  };
}

/**
 * Ricalcola e persiste il totale di un ordine.
 * Deve essere invocato all'interno di una transazione che ha gia il lock
 * sull'ordine (o almeno dopo aver verificato la proprieta).
 *
 * @param {object} strapi istanza Strapi globale
 * @param {string} orderDocumentId documentId dell'ordine
 * @returns {Promise<{ subtotal: number, tax: number, discount: number, total: number, lock_version: number }>}
 */
async function recalculateTotal(strapi, orderDocumentId) {
  // Legge l'ordine corrente
  const orders = await strapi.documents('api::order.order').findMany({
    filters: { documentId: { $eq: orderDocumentId } },
    populate: ['fk_items'],
    limit: 1,
  });
  const order = orders && orders.length > 0 ? orders[0] : null;
  if (!order) {
    throw new Error(`Ordine ${orderDocumentId} non trovato per ricalcolo totale.`);
  }

  const items = order.fk_items || [];
  const result = computeTotal({ items });

  const newVersion = (order.lock_version || 0) + 1;

  await strapi.documents('api::order.order').update({
    documentId: orderDocumentId,
    data: {
      total_amount: result.total,
      lock_version: newVersion,
    },
  });

  return { ...result, lock_version: newVersion };
}

module.exports = {
  computeTotal,
  recalculateTotal,
};
