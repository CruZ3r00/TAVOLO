'use strict';

/**
 * OrderArchive controller — solo read.
 *
 * Le scritture sono fatte da `services/order-close-finalizer/index.js` al
 * momento della chiusura ordine. Qui esponiamo lo storico raggruppato per
 * giorno per il pannello "Storico ordini" del gestionale.
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { resolveStaffContext, STAFF_ROLES } = require('../../../utils/staff-access');

function canViewHistory(actor) {
  if (!actor || !actor.role) return false;
  return actor.role === STAFF_ROLES.OWNER || actor.role === STAFF_ROLES.GESTIONE;
}

const MAX_RANGE_DAYS = 366;
const DEFAULT_RANGE_DAYS = 30;

function parseInteger(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function clampRangeDays(days) {
  if (!Number.isFinite(days) || days <= 0) return DEFAULT_RANGE_DAYS;
  return Math.min(days, MAX_RANGE_DAYS);
}

/**
 * Estrae la data locale `YYYY-MM-DD` da un ISO string. Locale del server.
 * Usata per il raggruppamento per giorno.
 */
function localDateKey(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function summarizeItems(itemsJson) {
  if (!Array.isArray(itemsJson)) return { lines: 0, units: 0 };
  let units = 0;
  for (const it of itemsJson) {
    units += Number(it?.quantity) || 0;
  }
  return { lines: itemsJson.length, units };
}

function serializeArchive(row) {
  return {
    id: row.id,
    documentId: row.documentId,
    order_document_id: row.order_document_id,
    service_type: row.service_type || 'table',
    opened_at: row.opened_at,
    closed_at: row.closed_at,
    duration_minutes: row.duration_minutes,
    customer_name: row.customer_name || null,
    customer_phone: row.customer_phone || null,
    customer_email: row.customer_email || null,
    pickup_at: row.pickup_at || null,
    covers: row.covers || null,
    is_walkin: row.is_walkin === true,
    table_number: row.table_number || null,
    table_area: row.table_area || null,
    total_amount: Number(row.total_amount) || 0,
    payment_method: row.payment_method || null,
    payment_reference: row.payment_reference || null,
    items_count: row.items_count !== null && row.items_count !== undefined
      ? Number(row.items_count) || 0
      : summarizeItems(row.items_json).units,
    items: Array.isArray(row.items_json) ? row.items_json : [],
  };
}

module.exports = createCoreController('api::order-archive.order-archive', ({ strapi }) => ({
  /**
   * GET /api/order-archives/history
   *
   * Query:
   *   - from: ISO date (es. "2026-05-01"); default: now - 30gg
   *   - to:   ISO date (es. "2026-05-14"); default: now
   *   - service_type: "table" | "takeaway" (filtro opzionale)
   *   - page, pageSize: paginazione sulla LISTA flat, default 1/50, max 200.
   *
   * Risposta:
   *   {
   *     data: {
   *       days: [
   *         {
   *           date: "2026-05-14",
   *           orders: [serializedArchive...],
   *           totals: { revenue, items_units, orders_count }
   *         }
   *       ]
   *     },
   *     meta: { page, pageSize, total, range: { from, to } }
   *   }
   */
  async history(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    let staffCtx;
    try {
      staffCtx = await resolveStaffContext(strapi, user);
    } catch (e) {
      return ctx.forbidden('Accesso negato.');
    }
    if (!staffCtx || !canViewHistory(staffCtx)) {
      return ctx.forbidden('Solo titolare e gestione possono consultare lo storico.');
    }
    const ownerId = staffCtx.ownerId;

    const q = ctx.query || {};
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - DEFAULT_RANGE_DAYS * 24 * 3600 * 1000);

    const fromDt = q.from ? new Date(String(q.from)) : defaultFrom;
    const toDt = q.to ? new Date(String(q.to)) : now;
    if (Number.isNaN(fromDt.getTime()) || Number.isNaN(toDt.getTime()) || fromDt > toDt) {
      return ctx.badRequest('Range date non valido.');
    }
    // Hard cap sul range per evitare query enormi.
    const rangeMs = toDt.getTime() - fromDt.getTime();
    if (rangeMs > MAX_RANGE_DAYS * 24 * 3600 * 1000) {
      return ctx.badRequest(`Range massimo ${MAX_RANGE_DAYS} giorni.`);
    }

    const serviceType = typeof q.service_type === 'string' && ['table', 'takeaway'].includes(q.service_type)
      ? q.service_type
      : null;

    const page = parseInteger(q.page, 1);
    const pageSize = Math.min(parseInteger(q.pageSize, 50), 200);

    // Query: filter per owner + range + (eventuale service_type), ordinata DESC
    const filters = {
      fk_user: { id: { $eq: ownerId } },
      closed_at: { $gte: fromDt.toISOString(), $lte: toDt.toISOString() },
    };
    if (serviceType) filters.service_type = { $eq: serviceType };

    const rows = await strapi.db.query('api::order-archive.order-archive').findMany({
      where: filters,
      orderBy: [{ closed_at: 'desc' }],
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });
    const total = await strapi.db.query('api::order-archive.order-archive').count({ where: filters });

    // Raggruppa per giorno (data locale del server). Order interno: closed_at desc.
    const byDay = new Map();
    for (const row of rows) {
      const key = localDateKey(row.closed_at);
      if (!byDay.has(key)) {
        byDay.set(key, { date: key, orders: [], _revenue: 0, _units: 0 });
      }
      const day = byDay.get(key);
      const ser = serializeArchive(row);
      day.orders.push(ser);
      day._revenue += ser.total_amount;
      day._units += ser.items_count;
    }

    const days = [...byDay.values()].map((d) => ({
      date: d.date,
      totals: {
        revenue: Number(d._revenue.toFixed(2)),
        items_units: d._units,
        orders_count: d.orders.length,
      },
      orders: d.orders,
    }));
    // Ordina i giorni DESC (piu' recente prima).
    days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    ctx.body = {
      data: { days },
      meta: {
        page,
        pageSize,
        total,
        range: { from: fromDt.toISOString(), to: toDt.toISOString() },
      },
    };
  },
}));
