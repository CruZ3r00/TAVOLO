'use strict';

/**
 * Service per la gestione del turno bar.
 *
 * Modello:
 *   - 1 turno aperto / owner alla volta (invariante applicativa enforced
 *     via SELECT FOR UPDATE + retry; nessun partial unique index DB perche
 *     `fk_user` su `bar_shifts` vive in una link table Strapi v5).
 *   - "Carico fatto" e' la transizione atomica close-current + open-new:
 *     congela lo snapshot del report sul turno chiuso e apre subito
 *     un nuovo turno open per lo stesso owner.
 *   - Il report aggrega OrderItem `served` (dine-in) o OrderItem di
 *     takeaway `picked_up` nel periodo [opened_at, closed_at|now), per
 *     soli Element con `is_beverage=true`. Free-form (fk_element=null)
 *     con category classificata BAR appaiono in sezione separata.
 *
 * Idempotenza:
 *   - `closeShift` su turno gia chiuso restituisce lo snapshot esistente
 *     (no-op + 200 OK).
 *   - `openShift` su owner con un turno gia open lancia BAR_SHIFT_ALREADY_OPEN.
 *
 * Concorrenza:
 *   - Usa `withRetry` di db-lock.js per gestire deadlock.
 *   - SELECT FOR UPDATE sulle righe `bar_shifts` open dell'owner.
 *
 * Vedi `todo.md` FASE 1 per il contesto di prodotto.
 */

const {
  withRetry,
  getDialect,
  isSqlite,
} = require('../../utils/db-lock');

const { classifyCategory } = require('../../utils/category-routing');
const inventoryService = require('../inventory');

/* ------------------------------------------------------------------ */
/* Costanti errori                                                    */
/* ------------------------------------------------------------------ */

function appError(code, message, details) {
  const err = new Error(message || code);
  err._resCode = code;
  if (details) err.details = details;
  return err;
}

/* ------------------------------------------------------------------ */
/* Lookup / serializer                                                */
/* ------------------------------------------------------------------ */

async function findOpenShift(strapi, ownerId) {
  // findMany con populate=fk_user e filter via relation
  const rows = await strapi.db.query('api::bar-shift.bar-shift').findMany({
    where: { status: 'open', fk_user: { id: ownerId } },
    populate: { fk_user: true, opened_by: true, closed_by: true },
    orderBy: { opened_at: 'desc' },
    limit: 1,
  });
  return rows[0] || null;
}

async function lockOpenShifts(trx, ownerId, dialect) {
  // FOR UPDATE su tutte le righe open dell'owner — niente su SQLite.
  if (isSqlite(dialect)) return;
  await trx.raw(
    `SELECT bs.id FROM bar_shifts bs
     INNER JOIN bar_shifts_fk_user_lnk lnk ON lnk.bar_shift_id = bs.id
     WHERE lnk.user_id = ? AND bs.status = 'open'
     FOR UPDATE`,
    [ownerId]
  );
}

function serializeShift(shift) {
  if (!shift) return null;
  return {
    id: shift.id,
    documentId: shift.documentId,
    status: shift.status,
    opened_at: shift.opened_at,
    closed_at: shift.closed_at || null,
    note: shift.note || null,
    snapshot: shift.snapshot || null,
    opened_by: shift.opened_by ? {
      id: shift.opened_by.id,
      username: shift.opened_by.username,
      name: shift.opened_by.name || null,
    } : null,
    closed_by: shift.closed_by ? {
      id: shift.closed_by.id,
      username: shift.closed_by.username,
      name: shift.closed_by.name || null,
    } : null,
  };
}

/* ------------------------------------------------------------------ */
/* Report building                                                    */
/* ------------------------------------------------------------------ */

/**
 * Aggrega gli OrderItem `served`/`picked_up` nel periodo del turno.
 * Per ogni Element con `is_beverage=true`, calcola units_consumed:
 *   - `is_beverage_advanced=false` → 1 unita per ogni OrderItem (sum qty)
 *   - `is_beverage_advanced=true` → richiede ElementIngredient + Ingredient
 *     (FASE 4). Se non disponibile, fallback a unitario.
 * Free-form (fk_element=null) con category classificata BAR via regex →
 * sezione separata `freeform[]`, niente units.
 *
 * @param {object} strapi
 * @param {number} ownerId
 * @param {string} fromISO
 * @param {string} toISO
 * @returns {Promise<object>} payload del report
 */
async function aggregateServedItems(strapi, ownerId, fromISO, toISO) {
  const knex = strapi.db.connection;

  // Query dine-in: OrderItem status=served, served_at ∈ [from, to), fk_user=owner.
  const dineRows = await knex({ oi: 'order_items' })
    .leftJoin('order_items_fk_order_lnk as oilnk', 'oilnk.order_item_id', 'oi.id')
    .leftJoin('orders as o', 'o.id', 'oilnk.order_id')
    .leftJoin('orders_fk_user_lnk as ulnk', 'ulnk.order_id', 'o.id')
    .leftJoin('order_items_fk_element_lnk as elnk', 'elnk.order_item_id', 'oi.id')
    .leftJoin('elements as el', 'el.id', 'elnk.element_id')
    .where('ulnk.user_id', ownerId)
    .where('oi.status', 'served')
    .where('oi.voided', false)
    .where('o.service_type', 'table')
    .whereBetween('oi.served_at', [fromISO, toISO])
    .select(
      'oi.id as oi_id',
      'oi.name as oi_name',
      'oi.price as oi_price',
      'oi.quantity as oi_qty',
      'oi.category as oi_category',
      'el.id as element_id',
      'el.document_id as element_documentId',
      'el.name as element_name',
      'el.category as element_category',
      'el.is_beverage as element_is_beverage',
      'el.is_beverage_advanced as element_is_beverage_advanced'
    );

  // Query takeaway: OrderItem di un Order takeaway con picked_up_at ∈ [from, to).
  const takeawayRows = await knex({ oi: 'order_items' })
    .leftJoin('order_items_fk_order_lnk as oilnk', 'oilnk.order_item_id', 'oi.id')
    .leftJoin('orders as o', 'o.id', 'oilnk.order_id')
    .leftJoin('orders_fk_user_lnk as ulnk', 'ulnk.order_id', 'o.id')
    .leftJoin('order_items_fk_element_lnk as elnk', 'elnk.order_item_id', 'oi.id')
    .leftJoin('elements as el', 'el.id', 'elnk.element_id')
    .where('ulnk.user_id', ownerId)
    .where('oi.voided', false)
    .where('o.service_type', 'takeaway')
    .where('o.takeaway_status', 'picked_up')
    .whereBetween('o.picked_up_at', [fromISO, toISO])
    .select(
      'oi.id as oi_id',
      'oi.name as oi_name',
      'oi.price as oi_price',
      'oi.quantity as oi_qty',
      'oi.category as oi_category',
      'el.id as element_id',
      'el.document_id as element_documentId',
      'el.name as element_name',
      'el.category as element_category',
      'el.is_beverage as element_is_beverage',
      'el.is_beverage_advanced as element_is_beverage_advanced'
    );

  const allRows = dineRows.concat(takeawayRows);

  // Aggregazione: per Element-bar (is_beverage=true), accumula. Per free-form
  // con category-classificata-bar, accumula in freeform[]. Altrimenti scarta.
  const byElement = new Map();
  const freeformByName = new Map();
  let revenueAll = 0;
  let itemsAll = 0;

  for (const row of allRows) {
    const qty = Number(row.oi_qty) || 0;
    const price = Number(row.oi_price) || 0;
    const revenue = qty * price;

    const isElementBar = row.element_id && row.element_is_beverage === true;
    const isFreeform = !row.element_id;
    const freeformCategory = String(row.oi_category || '').trim();
    const freeformIsBar = isFreeform && freeformCategory && classifyCategory(freeformCategory) === 'bar';

    if (isElementBar) {
      const k = String(row.element_documentId || row.element_id);
      if (!byElement.has(k)) {
        byElement.set(k, {
          element_id: row.element_id,
          element_documentId: row.element_documentId,
          name: row.element_name,
          category: row.element_category,
          is_beverage_advanced: row.element_is_beverage_advanced === true,
          served_count: 0,
          revenue: 0,
        });
      }
      const entry = byElement.get(k);
      entry.served_count += qty;
      entry.revenue += revenue;
      revenueAll += revenue;
      itemsAll += qty;
    } else if (freeformIsBar) {
      const k = String(row.oi_name || '').trim().toLowerCase();
      if (!freeformByName.has(k)) {
        freeformByName.set(k, {
          name: row.oi_name,
          category: row.oi_category || null,
          served_count: 0,
          revenue: 0,
        });
      }
      const entry = freeformByName.get(k);
      entry.served_count += qty;
      entry.revenue += revenue;
      revenueAll += revenue;
      itemsAll += qty;
    }
    // else: piatto non-bar → ignora nel report bar
  }

  // Costruisce sezione "units" del report.
  const units = [];
  for (const e of byElement.values()) {
    const units_consumed = e.is_beverage_advanced
      ? null // calcolato in FASE 4 con ElementIngredient + Ingredient
      : e.served_count;
    units.push({
      element_documentId: e.element_documentId,
      name: e.name,
      category: e.category,
      is_beverage_advanced: e.is_beverage_advanced,
      served_count: e.served_count,
      units_consumed,
      revenue: Number(e.revenue.toFixed(2)),
    });
  }
  units.sort((a, b) => a.name.localeCompare(b.name, 'it'));

  const freeform = [];
  for (const e of freeformByName.values()) {
    freeform.push({
      name: e.name,
      category: e.category,
      served_count: e.served_count,
      units_consumed: null, // riservato per parseFreeformIngredients in FASE 4
      revenue: Number(e.revenue.toFixed(2)),
      matched_ingredients: [], // riservato FASE 4
    });
  }
  freeform.sort((a, b) => String(a.name).localeCompare(String(b.name), 'it'));

  return {
    totals: {
      revenue: Number(revenueAll.toFixed(2)),
      items_count: itemsAll,
    },
    units,
    freeform,
  };
}

async function buildReport(strapi, ownerId, shift) {
  if (!shift) throw appError('BAR_SHIFT_NOT_OPEN', 'Nessun turno aperto.');
  const from = shift.opened_at;
  const to = shift.closed_at || new Date().toISOString();
  const inner = await aggregateServedItems(strapi, ownerId, from, to);

  const openedTs = new Date(from).getTime();
  const closedTs = new Date(to).getTime();
  const durationSeconds = Number.isFinite(openedTs) && Number.isFinite(closedTs)
    ? Math.max(0, Math.floor((closedTs - openedTs) / 1000))
    : 0;

  return {
    shift_id: shift.id,
    shift_documentId: shift.documentId,
    opened_at: from,
    closed_at: shift.closed_at || null,
    duration_seconds: durationSeconds,
    status: shift.status,
    note: shift.note || null,
    totals: inner.totals,
    units: inner.units,
    freeform: inner.freeform,
  };
}

/* ------------------------------------------------------------------ */
/* Open / Close / Carico Fatto                                        */
/* ------------------------------------------------------------------ */

async function openShift(strapi, ownerId, openedById, note) {
  const dialect = getDialect(strapi);

  return withRetry(async () => {
    return strapi.db.transaction(async ({ trx }) => {
      await lockOpenShifts(trx, ownerId, dialect);

      // Re-check con la transazione attiva
      const existing = await trx('bar_shifts as bs')
        .innerJoin('bar_shifts_fk_user_lnk as lnk', 'lnk.bar_shift_id', 'bs.id')
        .where('lnk.user_id', ownerId)
        .where('bs.status', 'open')
        .select('bs.id')
        .first();

      if (existing && existing.id) {
        throw appError('BAR_SHIFT_ALREADY_OPEN', 'Esiste gia un turno aperto.');
      }

      const data = {
        status: 'open',
        opened_at: new Date(),
        fk_user: ownerId,
      };
      if (openedById) data.opened_by = openedById;
      if (typeof note === 'string' && note.trim()) data.note = note.trim().slice(0, 1000);

      const created = await strapi.documents('api::bar-shift.bar-shift').create({
        data,
        populate: { fk_user: true, opened_by: true },
      });
      return created;
    });
  }, { maxAttempts: 3 });
}

async function closeShift(strapi, ownerId, shiftIdOrDocId, closedById, note) {
  const dialect = getDialect(strapi);

  return withRetry(async () => {
    return strapi.db.transaction(async ({ trx }) => {
      // Find shift by documentId or numeric id; check owner.
      const isNumeric = /^\d+$/.test(String(shiftIdOrDocId));
      const where = { fk_user: { id: ownerId } };
      if (isNumeric) where.id = Number(shiftIdOrDocId);
      else where.documentId = String(shiftIdOrDocId);

      const shift = await strapi.db.query('api::bar-shift.bar-shift').findOne({
        where,
        populate: { fk_user: true, opened_by: true, closed_by: true },
      });

      if (!shift) throw appError('BAR_SHIFT_NOT_FOUND', 'Turno non trovato.');

      // Idempotente: se gia chiuso, ritorna invariato (con snapshot esistente)
      if (shift.status === 'closed') {
        return shift;
      }

      if (!isSqlite(dialect)) {
        await trx.raw('SELECT id FROM bar_shifts WHERE id = ? FOR UPDATE', [shift.id]);
      }

      // Re-check after lock
      const reload = await trx('bar_shifts').where({ id: shift.id }).select('status').first();
      if (reload && reload.status === 'closed') {
        return shift; // race: someone else closed it
      }

      // Compute report and freeze snapshot
      const reportShift = { ...shift, closed_at: new Date().toISOString() };
      const report = await buildReport(strapi, ownerId, reportShift);

      const updateData = {
        status: 'closed',
        closed_at: new Date(),
        snapshot: report,
      };
      if (closedById) updateData.closed_by = closedById;
      if (typeof note === 'string' && note.trim()) {
        updateData.note = note.trim().slice(0, 1000);
      }

      const updated = await strapi.documents('api::bar-shift.bar-shift').update({
        documentId: shift.documentId,
        data: updateData,
        populate: { fk_user: true, opened_by: true, closed_by: true },
      });
      return updated;
    });
  }, { maxAttempts: 3 });
}

/**
 * Carico fatto: atomic close-current + open-new.
 * FASE 4 (TODO): chiamare inventory.commitBarShift dentro la stessa transazione
 * per scaricare le quantita di bevande dal magazzino centrale.
 */
async function caricoFatto(strapi, ownerId, actorId, note) {
  const dialect = getDialect(strapi);

  return withRetry(async () => {
    return strapi.db.transaction(async ({ trx }) => {
      await lockOpenShifts(trx, ownerId, dialect);

      const current = await strapi.db.query('api::bar-shift.bar-shift').findOne({
        where: { status: 'open', fk_user: { id: ownerId } },
        populate: { fk_user: true, opened_by: true },
      });
      if (!current) throw appError('BAR_SHIFT_NOT_OPEN', 'Nessun turno aperto da chiudere.');

      // 1) Calcola report
      const reportShift = { ...current, closed_at: new Date().toISOString() };
      const report = await buildReport(strapi, ownerId, reportShift);

      // 2) Chiude il turno corrente
      const closeData = {
        status: 'closed',
        closed_at: new Date(),
        snapshot: report,
      };
      if (actorId) closeData.closed_by = actorId;
      if (typeof note === 'string' && note.trim()) {
        closeData.note = note.trim().slice(0, 1000);
      }
      const closed = await strapi.documents('api::bar-shift.bar-shift').update({
        documentId: current.documentId,
        data: closeData,
        populate: { fk_user: true, opened_by: true, closed_by: true },
      });

      // 3) Inventory: scarica le bevande dal magazzino centrale.
      //    Fail-soft: errore qui non rompe il carico fatto (il turno e' gia
      //    chiuso con snapshot). Il log warn permette di rimediare manualmente.
      try {
        await inventoryService.commitBarShift(strapi, report, ownerId, current.id);
      } catch (invErr) {
        strapi.log.warn(`bar-shift.caricoFatto: commitBarShift owner=${ownerId} fallito: ${invErr.message}`);
      }

      // 4) Apre subito un nuovo turno
      const openData = {
        status: 'open',
        opened_at: new Date(),
        fk_user: ownerId,
      };
      if (actorId) openData.opened_by = actorId;
      const newShift = await strapi.documents('api::bar-shift.bar-shift').create({
        data: openData,
        populate: { fk_user: true, opened_by: true },
      });

      return { closed, opened: newShift, report };
    });
  }, { maxAttempts: 3 });
}

/* ------------------------------------------------------------------ */
/* History                                                            */
/* ------------------------------------------------------------------ */

async function listHistory(strapi, ownerId, opts = {}) {
  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(opts.pageSize, 10) || 25));
  const where = { fk_user: { id: ownerId }, status: 'closed' };

  if (opts.from || opts.to) {
    where.closed_at = {};
    if (opts.from) where.closed_at.$gte = new Date(opts.from);
    if (opts.to) where.closed_at.$lte = new Date(opts.to);
  }

  const rows = await strapi.db.query('api::bar-shift.bar-shift').findMany({
    where,
    populate: { opened_by: true, closed_by: true },
    orderBy: { closed_at: 'desc' },
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const total = await strapi.db.query('api::bar-shift.bar-shift').count({ where });

  return {
    data: rows.map(serializeShift),
    meta: { page, pageSize, total },
  };
}

async function getById(strapi, ownerId, shiftIdOrDocId) {
  const isNumeric = /^\d+$/.test(String(shiftIdOrDocId));
  const where = { fk_user: { id: ownerId } };
  if (isNumeric) where.id = Number(shiftIdOrDocId);
  else where.documentId = String(shiftIdOrDocId);

  const shift = await strapi.db.query('api::bar-shift.bar-shift').findOne({
    where,
    populate: { fk_user: true, opened_by: true, closed_by: true },
  });
  return shift || null;
}

module.exports = {
  appError,
  serializeShift,
  findOpenShift,
  buildReport,
  openShift,
  closeShift,
  caricoFatto,
  listHistory,
  getById,
};
