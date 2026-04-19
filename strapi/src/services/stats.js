'use strict';

/**
 * Stats & archiving service.
 *
 * Invocato a chiusura ordine (dentro la transazione di close) per:
 *  - creare uno snapshot immutabile in OrderArchive (storico granulare);
 *  - aggiornare il contatore giornaliero RestaurantDailyStat;
 *  - aggiornare il contatore lifetime MenuElementStat per ogni item.
 *
 * Strapi v5 propaga la transazione Knex via AsyncLocalStorage quando
 * `strapi.documents` viene invocato dentro `strapi.db.transaction`.
 * Quindi tutte le scritture qui partecipano alla stessa tx.
 *
 * Filosofia "fail-soft": la chiusura dell'ordine (source of truth)
 * NON deve fallire se l'aggregazione ha un bug — gli ordini restano
 * in DB come fonte ricostruibile. Le eccezioni vengono loggate e
 * soppresse dal chiamante (vedi order.close).
 */

/**
 * Estrae la parte date (YYYY-MM-DD) da un ISO datetime in UTC.
 */
function dateKeyUTC(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Calcola la durata in minuti tra due ISO datetime.
 */
function durationMinutes(openedAt, closedAt) {
  const a = new Date(openedAt).getTime();
  const b = new Date(closedAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 60000);
}

/**
 * Crea snapshot immutabile dell'ordine.
 *
 * @returns documento OrderArchive creato.
 */
async function archiveClosedOrder(strapi, {
  order,
  items,
  reservation,
  table,
  paymentMethod,
  paymentReference,
  userId,
  isWalkin,
}) {
  const itemsSnapshot = (items || []).map((it) => ({
    name: it.name,
    price: parseFloat(it.price) || 0,
    quantity: parseInt(it.quantity, 10) || 0,
    notes: it.notes || null,
    status: it.status || null,
    element_document_id: it.fk_element && it.fk_element.documentId ? it.fk_element.documentId : null,
  }));

  const itemsCount = itemsSnapshot.reduce((s, it) => s + it.quantity, 0);

  const data = {
    order_document_id: order.documentId,
    reservation_document_id: reservation ? reservation.documentId : null,
    opened_at: order.opened_at,
    closed_at: order.closed_at || new Date().toISOString(),
    duration_minutes: durationMinutes(order.opened_at, order.closed_at || new Date().toISOString()),
    customer_name: reservation ? reservation.customer_name : null,
    covers: order.covers || (reservation ? reservation.number_of_people : null),
    is_walkin: !!isWalkin,
    table_number: table ? table.number : null,
    table_area: table ? (table.area || 'interno') : null,
    total_amount: parseFloat(order.total_amount) || 0,
    payment_method: paymentMethod || null,
    payment_reference: paymentReference || null,
    items_json: itemsSnapshot,
    items_count: itemsCount,
    fk_user: { connect: [{ id: userId }] },
  };

  return strapi.documents('api::order-archive.order-archive').create({ data });
}

/**
 * Upsert della stat giornaliera per (fk_user, date).
 * Usa query Knex raw con JOIN su link table (Strapi v5 non ha fk_user_id).
 */
async function updateDailyStat(strapi, {
  userId,
  dateKey,
  revenue,
  customers,
  items,
  isWalkin,
  hasReservation,
}) {
  if (!dateKey) return null;

  const existing = await strapi.db.query('api::restaurant-daily-stat.restaurant-daily-stat').findMany({
    where: {
      date: dateKey,
      fk_user: { id: userId },
    },
    limit: 1,
  });

  if (existing && existing.length > 0) {
    const row = existing[0];
    return strapi.documents('api::restaurant-daily-stat.restaurant-daily-stat').update({
      documentId: row.documentId,
      data: {
        orders_count: (row.orders_count || 0) + 1,
        customers_count: (row.customers_count || 0) + (customers || 0),
        revenue: (parseFloat(row.revenue) || 0) + (parseFloat(revenue) || 0),
        items_sold: (row.items_sold || 0) + (items || 0),
        walkin_count: (row.walkin_count || 0) + (isWalkin ? 1 : 0),
        reservation_count: (row.reservation_count || 0) + (hasReservation ? 1 : 0),
      },
    });
  }

  return strapi.documents('api::restaurant-daily-stat.restaurant-daily-stat').create({
    data: {
      date: dateKey,
      orders_count: 1,
      customers_count: customers || 0,
      revenue: parseFloat(revenue) || 0,
      items_sold: items || 0,
      walkin_count: isWalkin ? 1 : 0,
      reservation_count: hasReservation ? 1 : 0,
      fk_user: { connect: [{ id: userId }] },
    },
  });
}

/**
 * Upsert MenuElementStat per ogni item con fk_element popolato.
 * Items fuori menu (senza fk_element) vengono ignorati.
 */
async function updateElementStats(strapi, { userId, items, timestamp }) {
  if (!Array.isArray(items) || items.length === 0) return;

  for (const item of items) {
    const el = item.fk_element;
    if (!el || !el.id) continue;

    const quantity = parseInt(item.quantity, 10) || 0;
    const revenue = (parseFloat(item.price) || 0) * quantity;
    if (quantity <= 0) continue;

    const existing = await strapi.db.query('api::menu-element-stat.menu-element-stat').findMany({
      where: {
        fk_user: { id: userId },
        fk_element: { id: el.id },
      },
      limit: 1,
    });

    if (existing && existing.length > 0) {
      const row = existing[0];
      await strapi.documents('api::menu-element-stat.menu-element-stat').update({
        documentId: row.documentId,
        data: {
          total_ordered: (row.total_ordered || 0) + quantity,
          total_revenue: (parseFloat(row.total_revenue) || 0) + revenue,
          last_ordered_at: timestamp,
          element_name_snapshot: item.name || row.element_name_snapshot,
        },
      });
    } else {
      await strapi.documents('api::menu-element-stat.menu-element-stat').create({
        data: {
          element_name_snapshot: item.name || 'Sconosciuto',
          total_ordered: quantity,
          total_revenue: revenue,
          first_ordered_at: timestamp,
          last_ordered_at: timestamp,
          fk_user: { connect: [{ id: userId }] },
          fk_element: { connect: [{ id: el.id }] },
        },
      });
    }
  }
}

module.exports = {
  dateKeyUTC,
  durationMinutes,
  archiveClosedOrder,
  updateDailyStat,
  updateElementStats,
};
