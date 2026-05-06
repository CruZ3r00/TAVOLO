'use strict';

/**
 * order controller
 *
 * Gestisce ordini in sala: apertura, aggiunta/modifica/eliminazione item,
 * transizione stato item (FSM), chiusura con pagamento.
 *
 * Pattern concorrenza: identico ad ADR-0001 (transazione Knex + row-level
 * lock + optimistic locking via lock_version + retry con backoff).
 *
 * Vedi ADR-0002 per le motivazioni architetturali.
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { errors } = require('@strapi/utils');

const { computeTotal, recalculateTotal } = require('../../../utils/order-total');
const {
  withRetry,
  getDialect,
  isSqlite,
} = require('../../../utils/db-lock');

const paymentService = require('../../../services/payment');
const statsService = require('../../../services/stats');
const posBridge = require('../../../services/pos-bridge');
const {
  STAFF_ROLES,
  KITCHEN_LIKE_ROLES,
  resolveStaffContext,
  assertStaffRole,
  canTransitionItem,
} = require('../../../utils/staff-access');
const {
  normalizeStation,
  stationForCategory: stationForCategoryByOwner,
  loadRoutingMap,
} = require('../../../utils/category-routing');

const { ApplicationError } = errors;

/* ------------------------------------------------------------------ */
/* FSM item                                                           */
/* ------------------------------------------------------------------ */

const ITEM_TRANSITIONS = {
  taken: ['preparing'],
  preparing: ['ready'],
  ready: ['served'],
  served: [],
};

const ITEM_STATUS_ENUM = ['taken', 'preparing', 'ready', 'served'];

/* ------------------------------------------------------------------ */
/* Error helpers (allineati a reservation)                            */
/* ------------------------------------------------------------------ */

const ERROR_STATUS = {
  INVALID_PAYLOAD: 400,
  INVALID_ITEM_TRANSITION: 400,
  PAYMENT_DECLINED: 402,
  NOT_OWNER: 403,
  TABLE_NOT_FOUND: 404,
  ORDER_NOT_FOUND: 404,
  ITEM_NOT_FOUND: 404,
  TABLE_ALREADY_OCCUPIED: 409,
  ORDER_NOT_ACTIVE: 409,
  ITEM_NOT_EDITABLE: 409,
  STALE_ORDER: 409,
  ORDER_CONTENTION: 503,
  PAYMENT_UNAVAILABLE: 503,
  PAYMENT_TIMEOUT: 504,
  POS_DEVICE_NOT_FOUND: 409,
};

function appError(code, message, details) {
  const err = new ApplicationError(message, details ? { code, details } : { code });
  err._resCode = code;
  return err;
}

function sendError(ctx, err) {
  const code = err && err._resCode ? err._resCode : null;
  if (code && ERROR_STATUS[code]) {
    const details = err.details && err.details.details ? err.details.details : undefined;
    const body = { error: { code, message: err.message } };
    if (details) body.error.details = details;
    ctx.status = ERROR_STATUS[code];
    ctx.body = body;
    return;
  }
  strapi.log.error('order controller: errore non gestito', err);
  ctx.status = 500;
  ctx.body = { error: { code: 'INTERNAL_ERROR', message: 'Errore interno.' } };
}

/* ------------------------------------------------------------------ */
/* Serializers                                                        */
/* ------------------------------------------------------------------ */

function serializeItem(item, routingLookup) {
  if (!item) return null;
  const category = item.category || (item.fk_element ? item.fk_element.category : null) || null;
  return {
    documentId: item.documentId,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    category,
    course: parseInt(item.course, 10) || 1,
    notes: item.notes || null,
    status: item.status,
    station: routingLookup ? routingLookup(category) : null,
    fk_element: item.fk_element ? { documentId: item.fk_element.documentId } : null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function serializeOrder(order, includeItems, routingLookup) {
  if (!order) return null;
  const result = {
    documentId: order.documentId,
    status: order.status,
    opened_at: order.opened_at,
    closed_at: order.closed_at || null,
    total_amount: order.total_amount,
    payment_status: order.payment_status,
    payment_reference: order.payment_reference || null,
    lock_version: order.lock_version,
    covers: order.covers || null,
    table: order.fk_table ? {
      documentId: order.fk_table.documentId,
      number: order.fk_table.number,
      seats: order.fk_table.seats,
      area: order.fk_table.area,
      status: order.fk_table.status,
    } : null,
    reservation: order.fk_reservation ? {
      documentId: order.fk_reservation.documentId,
      customer_name: order.fk_reservation.customer_name,
      number_of_people: order.fk_reservation.number_of_people,
      is_walkin: !!order.fk_reservation.is_walkin,
      status: order.fk_reservation.status,
      notes: order.fk_reservation.notes || null,
    } : null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
  if (includeItems) {
    result.items = (order.fk_items || []).map((item) => serializeItem(item, routingLookup));
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* DB lock helpers (orders-specific, riuso db-lock.js di base)        */
/* ------------------------------------------------------------------ */

async function lockOrderRow(trx, orderId, dialect) {
  if (isSqlite(dialect)) return;
  await trx.raw('SELECT id FROM orders WHERE id = ? FOR UPDATE', [orderId]);
}

async function lockTableRow(trx, tableId, dialect) {
  if (isSqlite(dialect)) return;
  await trx.raw('SELECT id FROM tables WHERE id = ? FOR UPDATE', [tableId]);
}

async function beginImmediate(trx, dialect) {
  if (!isSqlite(dialect)) return;
  try {
    await trx.raw('BEGIN IMMEDIATE');
  } catch (_e) {
    // Knex gia in transazione; upgrade a IMMEDIATE puo fallire.
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Carica ordine con populate e verifica ownership.
 * Ownership via filter sulla relazione (affidabile anche con link tables Strapi v5).
 * Se non trovato col filtro, discrimina 404 vs 403 con una query DB minima.
 */
async function loadOrder(documentId, userId, { populate } = {}) {
  const pop = populate || {
    fk_items: { populate: ['fk_element'] },
    fk_table: true,
    fk_user: true,
    fk_reservation: true,
  };
  const results = await strapi.documents('api::order.order').findMany({
    filters: {
      documentId: { $eq: documentId },
      fk_user: { id: { $eq: userId } },
    },
    populate: pop,
    limit: 1,
  });
  if (results && results.length > 0) return results[0];

  const existing = await strapi.db.query('api::order.order').findOne({
    where: { documentId },
    select: ['id'],
  });
  if (existing) throw appError('NOT_OWNER', 'Non autorizzato.');
  throw appError('ORDER_NOT_FOUND', 'Ordine non trovato.');
}

/**
 * Carica un elemento menu solo se appartiene al menu pubblicato dell'utente.
 * Element non ha fk_user diretto, quindi l'ownership passa dalla relazione Menu.
 */
async function loadOwnedMenuElement(documentId, userId) {
  const menus = await strapi.documents('api::menu.menu').findMany({
    filters: {
      fk_user: { id: { $eq: userId } },
    },
    populate: { fk_elements: true },
    status: 'published',
    limit: 1,
  });
  const menu = menus && menus.length > 0 ? menus[0] : null;
  const element = (menu && Array.isArray(menu.fk_elements) ? menu.fk_elements : [])
    .find((item) => item && item.documentId === documentId);
  if (!element) throw appError('INVALID_PAYLOAD', 'Elemento menu non trovato.');
  return element;
}

function serializePosJobItem(item) {
  return {
    name: item.name,
    quantity: parseInt(item.quantity, 10) || 1,
    price: Number(item.price || 0),
    category: item.category || (item.fk_element ? item.fk_element.category : null) || null,
    course: parseInt(item.course, 10) || 1,
    notes: item.notes || null,
    element_document_id: item.fk_element ? item.fk_element.documentId : null,
  };
}

/** Verifica lock_version (optimistic locking). */
function assertLockVersion(order, clientVersion) {
  if (clientVersion === undefined || clientVersion === null) return; // Non fornito = skip
  const cv = parseInt(clientVersion, 10);
  if (Number.isNaN(cv)) return;
  if (cv !== order.lock_version) {
    throw appError('STALE_ORDER', 'Ordine modificato da un altro utente. Ricarica e riprova.', {
      expected: cv,
      actual: order.lock_version,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Pagination                                                         */
/* ------------------------------------------------------------------ */

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const ORDER_STATUS_ENUM = ['active', 'closed'];

function stationForActor(actor, query) {
  if (!actor) return null;
  if (actor.role === STAFF_ROLES.CUCINA) {
    const requested = normalizeStation(query && query.station);
    return requested === STAFF_ROLES.CUCINA_SG ? requested : STAFF_ROLES.CUCINA;
  }
  if (KITCHEN_LIKE_ROLES.has(actor.role)) return actor.role;
  if (actor.role === STAFF_ROLES.OWNER || actor.role === STAFF_ROLES.GESTIONE) {
    return normalizeStation(query && query.station);
  }
  return null;
}

function filterItemsForStation(order, routingLookup, station) {
  if (!station || !order || !Array.isArray(order.fk_items)) return order;

  const filtered = order.fk_items.filter((item) => {
    const itemStation = routingLookup(item.category || (item.fk_element && item.fk_element.category));
    return itemStation === station;
  });
  return { ...order, fk_items: filtered };
}

function filterOrdersForStation(orders, routingLookup, station) {
  if (!station) return orders;
  const filtered = [];
  for (const order of orders || []) {
    const stationOrder = filterItemsForStation(order, routingLookup, station);
    if ((stationOrder.fk_items || []).some((item) => item.status !== 'served')) {
      filtered.push(stationOrder);
    }
  }
  return filtered;
}

/**
 * Filtra a livello SQL gli ordini che hanno almeno un item non-servito
 * routato verso `station` per l'owner. Restituisce IDs ordinati + total per
 * paginazione corretta. Sostituisce il post-filter in JS che rompeva total/pageCount.
 */
async function listOrderIdsForStation(strapi, params) {
  const { ownerId, station, statusFilter, tableFilter, from, to, linkedFilter, page, pageSize } = params;
  const conn = strapi.db.connection;

  const applyFilters = (q) => {
    let query = q
      .innerJoin('orders_fk_user_lnk as ul', 'ul.order_id', 'o.id')
      .innerJoin('order_items_fk_order_lnk as il', 'il.order_id', 'o.id')
      .innerJoin('order_items as oi', 'oi.id', 'il.order_item_id')
      .innerJoin('restaurant_category_routing as rcr', 'rcr.owner_id', 'ul.user_id')
      .whereRaw('LOWER(TRIM(rcr.category)) = LOWER(TRIM(oi.category))')
      .where('ul.user_id', ownerId)
      .where('rcr.staff_role', station)
      .where('oi.status', '<>', 'served');

    if (statusFilter && statusFilter.length) {
      query = query.whereIn('o.status', statusFilter);
    }
    if (tableFilter) {
      query = query
        .innerJoin('orders_fk_table_lnk as tl', 'tl.order_id', 'o.id')
        .innerJoin('tables as t', 't.id', 'tl.table_id')
        .where('t.document_id', tableFilter);
    }
    if (from) query = query.where('o.opened_at', '>=', from);
    if (to) query = query.where('o.opened_at', '<', to);

    if (linkedFilter === true) {
      query = query.whereExists(function () {
        this.select('*')
          .from('reservations_fk_order_lnk as rl')
          .whereRaw('rl.order_id = o.id');
      });
    } else if (linkedFilter === false) {
      query = query.whereNotExists(function () {
        this.select('*')
          .from('reservations_fk_order_lnk as rl')
          .whereRaw('rl.order_id = o.id');
      });
    }
    return query;
  };

  const idsQuery = applyFilters(conn('orders as o'))
    .select('o.id')
    .min('o.opened_at as opened_at_min')
    .groupBy('o.id')
    .orderBy('opened_at_min', 'desc')
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const countQuery = applyFilters(conn('orders as o'))
    .countDistinct('o.id as cnt')
    .first();

  const [rows, countRow] = await Promise.all([idsQuery, countQuery]);
  const ids = (rows || []).map((r) => r.id);
  const total = parseInt(countRow && countRow.cnt, 10) || 0;
  return { ids, total };
}

/* ================================================================== */
/* CONTROLLER                                                         */
/* ================================================================== */

module.exports = createCoreController('api::order.order', ({ strapi }) => ({
  /**
   * POST /api/orders
   * Apre un ordine per un tavolo.
   */
  async create(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CAMERIERE]);
      const ownerId = actor.ownerId;
      const body = ctx.request.body || {};
      const tableDocId = body.table_id;
      if (!tableDocId) throw appError('INVALID_PAYLOAD', 'table_id obbligatorio.');

      const covers = body.covers !== undefined ? parseInt(body.covers, 10) : null;
      if (covers !== null && (!Number.isFinite(covers) || covers < 1 || covers > 1000)) {
        throw appError('INVALID_PAYLOAD', 'covers deve essere 1..1000.');
      }

      const dialect = getDialect(strapi);

      const created = await withRetry(async () => {
        return strapi.db.transaction(async ({ trx }) => {
          await beginImmediate(trx, dialect);

          // Carica tavolo: JOIN con link table per ownership (Strapi v5 non ha fk_user_id sulla riga).
          const tableRows = await trx('tables as t')
            .leftJoin('tables_fk_user_lnk as lnk', 'lnk.table_id', 't.id')
            .where('t.document_id', tableDocId)
            .limit(1)
            .select('t.id as id', 't.status as status', 'lnk.user_id as user_id');

          if (!tableRows || tableRows.length === 0) {
            throw appError('TABLE_NOT_FOUND', 'Tavolo non trovato.');
          }
          const tbl = tableRows[0];
          if (tbl.user_id !== ownerId) {
            throw appError('NOT_OWNER', 'Non autorizzato.');
          }

          // Lock tavolo
          await lockTableRow(trx, tbl.id, dialect);

          if (tbl.status === 'occupied') {
            throw appError('TABLE_ALREADY_OCCUPIED', 'Tavolo gia occupato da un ordine attivo.');
          }

          // Verifica nessun ordine attivo su questo tavolo (JOIN con link table).
          const activeOrders = await trx('orders as o')
            .innerJoin('orders_fk_table_lnk as tl', 'tl.order_id', 'o.id')
            .innerJoin('orders_fk_user_lnk as ul', 'ul.order_id', 'o.id')
            .where('tl.table_id', tbl.id)
            .andWhere('ul.user_id', ownerId)
            .andWhere('o.status', 'active')
            .select('o.id as id');
          if (activeOrders.length > 0) {
            throw appError('TABLE_ALREADY_OCCUPIED', 'Esiste gia un ordine attivo su questo tavolo.');
          }

          // Crea ordine
          const orderDoc = await strapi.documents('api::order.order').create({
            data: {
              status: 'active',
              opened_at: new Date().toISOString(),
              total_amount: 0,
              payment_status: 'unpaid',
              lock_version: 0,
              covers: covers,
              fk_table: { connect: [{ id: tbl.id }] },
              fk_user: { connect: [{ id: ownerId }] },
            },
          });

          // Aggiorna status tavolo
          await strapi.documents('api::table.table').update({
            documentId: tableDocId,
            data: { status: 'occupied' },
          });

          return orderDoc;
        });
      }, { maxAttempts: 3 }).catch((err) => {
        if (err && err._resCode) throw err;
        throw appError('ORDER_CONTENTION', 'Contesa DB, riprova.');
      });

      // Ricarica con populate per response completa
      const full = await loadOrder(created.documentId, ownerId);

      ctx.status = 201;
      ctx.body = { data: serializeOrder(full, true) };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * GET /api/orders
   * Lista paginata degli ordini dell'utente.
   */
  async list(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [
        STAFF_ROLES.OWNER,
        STAFF_ROLES.GESTIONE,
        STAFF_ROLES.CAMERIERE,
        STAFF_ROLES.CUCINA,
        STAFF_ROLES.BAR,
        STAFF_ROLES.PIZZERIA,
        STAFF_ROLES.CUCINA_SG,
      ]);
      const ownerId = actor.ownerId;
      const q = ctx.request.query || {};
      const station = stationForActor(actor, q);

      const statusFilter = typeof q.status === 'string' && q.status.trim()
        ? q.status.split(',').map((s) => s.trim()).filter((s) => ORDER_STATUS_ENUM.includes(s))
        : null;

      const tableFilter = typeof q.table === 'string' && q.table.trim() ? q.table.trim() : null;

      const from = typeof q.from === 'string' && q.from.trim() ? q.from.trim() : null;
      const to = typeof q.to === 'string' && q.to.trim() ? q.to.trim() : null;
      if (from && Number.isNaN(new Date(from).getTime())) {
        throw appError('INVALID_PAYLOAD', 'from non valido.');
      }
      if (to && Number.isNaN(new Date(to).getTime())) {
        throw appError('INVALID_PAYLOAD', 'to non valido.');
      }

      const pageRaw = parseInt(q.page, 10);
      const pageSizeRaw = parseInt(q.pageSize, 10);
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
      const pageSize = Math.min(
        Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? pageSizeRaw : DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE
      );

      const filters = { fk_user: { id: { $eq: ownerId } } };
      if (statusFilter && statusFilter.length) {
        filters.status = { $in: statusFilter };
      }
      if (tableFilter) {
        filters.fk_table = { documentId: { $eq: tableFilter } };
      }
      if (from || to) {
        filters.opened_at = {};
        if (from) filters.opened_at.$gte = from;
        if (to) filters.opened_at.$lt = to;
      }

      const linkedRaw = typeof q.linked_reservation === 'string' ? q.linked_reservation.trim() : null;
      let linkedFilter = null;
      if (linkedRaw === 'true' || linkedRaw === '1') {
        linkedFilter = true;
        filters.fk_reservation = { id: { $notNull: true } };
      } else if (linkedRaw === 'false' || linkedRaw === '0') {
        linkedFilter = false;
        filters.fk_reservation = { id: { $null: true } };
      }

      const routingLookup = await loadRoutingMap(strapi, actor.owner);

      let results;
      let total;

      if (station) {
        // Filtro a livello SQL via JOIN su restaurant_category_routing.
        // Necessario per paginazione/total corretti: il vecchio post-filter
        // in JS contava il subset di una pagina invece del totale filtrato.
        const { ids, total: filteredTotal } = await listOrderIdsForStation(strapi, {
          ownerId,
          station,
          statusFilter,
          tableFilter,
          from,
          to,
          linkedFilter,
          page,
          pageSize,
        });
        total = filteredTotal;

        if (ids.length === 0) {
          results = [];
        } else {
          const populated = await strapi.documents('api::order.order').findMany({
            filters: { id: { $in: ids } },
            populate: {
              fk_table: true,
              fk_items: { populate: ['fk_element'] },
              fk_reservation: true,
            },
            sort: ['opened_at:desc'],
            pagination: { page: 1, pageSize: ids.length },
          });
          // Restringe gli item alla station richiesta (kanban di reparto).
          results = (populated || []).map((o) => filterItemsForStation(o, routingLookup, station));
        }
      } else {
        const [findResults, countTotal] = await Promise.all([
          strapi.documents('api::order.order').findMany({
            filters,
            populate: {
              fk_table: true,
              fk_items: { populate: ['fk_element'] },
              fk_reservation: true,
            },
            sort: ['opened_at:desc'],
            pagination: { page, pageSize },
          }),
          strapi.documents('api::order.order').count({ filters }),
        ]);
        results = findResults || [];
        total = countTotal;
      }

      ctx.body = {
        data: results.map((o) => serializeOrder(o, true, routingLookup)),
        meta: {
          pagination: {
            page,
            pageSize,
            total,
            pageCount: Math.ceil(total / pageSize),
          },
        },
      };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * GET /api/orders/:documentId
   * Dettaglio ordine con items.
   */
  async findOne(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [
        STAFF_ROLES.OWNER,
        STAFF_ROLES.GESTIONE,
        STAFF_ROLES.CAMERIERE,
        STAFF_ROLES.CUCINA,
        STAFF_ROLES.BAR,
        STAFF_ROLES.PIZZERIA,
        STAFF_ROLES.CUCINA_SG,
      ]);
      const { documentId } = ctx.params;
      if (!documentId) throw appError('INVALID_PAYLOAD', 'documentId mancante.');

      const station = stationForActor(actor, ctx.request.query || {});
      const routingLookup = await loadRoutingMap(strapi, actor.owner);
      const loaded = await loadOrder(documentId, actor.ownerId);
      const order = filterItemsForStation(loaded, routingLookup, station);

      ctx.body = { data: serializeOrder(order, true, routingLookup) };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * GET /api/orders/:documentId/total
   * Totale derivato in tempo reale.
   */
  async getTotal(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CAMERIERE]);
      const { documentId } = ctx.params;
      if (!documentId) throw appError('INVALID_PAYLOAD', 'documentId mancante.');

      const order = await loadOrder(documentId, actor.ownerId);
      const items = order.fk_items || [];
      const result = computeTotal({ items });

      ctx.body = { data: result };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * POST /api/orders/:documentId/items
   * Aggiunge item all'ordine. Due modalita:
   * - Da menu: { element_id, quantity, notes? }
   * - Libero: { name, price, quantity, notes? }
   */
  async addItem(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CAMERIERE]);
      const { documentId } = ctx.params;
      if (!documentId) throw appError('INVALID_PAYLOAD', 'documentId mancante.');

      const body = ctx.request.body || {};
      const order = await loadOrder(documentId, actor.ownerId);

      if (order.status !== 'active') {
        throw appError('ORDER_NOT_ACTIVE', 'Ordine gia chiuso.');
      }

      assertLockVersion(order, body.lock_version);

      let itemName, itemPrice, itemCategory, menuElement;

      if (body.element_id) {
        // Da menu: carica l'Element solo se appartiene al menu dell'utente.
        menuElement = await loadOwnedMenuElement(body.element_id, actor.ownerId);
        itemName = menuElement.name;
        itemPrice = menuElement.price;
        itemCategory = menuElement.category || null;
      } else {
        // Item libero
        itemName = typeof body.name === 'string' ? body.name.trim() : '';
        if (!itemName) throw appError('INVALID_PAYLOAD', 'name obbligatorio per item fuori menu.');
        if (itemName.length > 200) throw appError('INVALID_PAYLOAD', 'name troppo lungo (max 200).');

        itemPrice = parseFloat(body.price);
        if (!Number.isFinite(itemPrice) || itemPrice < 0) {
          throw appError('INVALID_PAYLOAD', 'price obbligatorio e deve essere >= 0.');
        }
        itemCategory = typeof body.category === 'string' ? body.category.trim() : null;
        if (itemCategory && itemCategory.length > 100) {
          throw appError('INVALID_PAYLOAD', 'category troppo lunga (max 100).');
        }
      }

      const quantity = parseInt(body.quantity, 10);
      if (!Number.isFinite(quantity) || quantity < 1) {
        throw appError('INVALID_PAYLOAD', 'quantity obbligatoria (intero >= 1).');
      }

      const course = body.course !== undefined ? parseInt(body.course, 10) : 1;
      if (!Number.isFinite(course) || course < 1 || course > 12) {
        throw appError('INVALID_PAYLOAD', 'course deve essere un intero 1..12.');
      }

      const notes = typeof body.notes === 'string' ? body.notes.trim() : null;

      // Crea item
      const itemData = {
        name: itemName,
        price: itemPrice,
        quantity,
        category: itemCategory || null,
        course,
        notes: notes && notes.length > 0 ? notes : null,
        status: 'taken',
        fk_order: { connect: [{ id: order.id }] },
      };

      if (menuElement) {
        itemData.fk_element = { connect: [{ id: menuElement.id }] };
      }

      const createdItem = await strapi.documents('api::order-item.order-item').create({
        data: itemData,
      });

      // Ricalcola totale
      const totalResult = await recalculateTotal(strapi, documentId);

      const routingLookup = await loadRoutingMap(strapi, actor.owner);

      ctx.status = 201;
      ctx.body = {
        data: {
          item: serializeItem(createdItem, routingLookup),
          order: {
            total_amount: totalResult.total,
            lock_version: totalResult.lock_version,
          },
        },
      };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * PATCH /api/orders/:documentId/items/:itemDocumentId
   * Aggiorna quantity/notes. Solo se item.status === 'taken' e order.status === 'active'.
   */
  async updateItem(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CAMERIERE]);
      const { documentId, itemDocumentId } = ctx.params;
      if (!documentId || !itemDocumentId) {
        throw appError('INVALID_PAYLOAD', 'documentId e itemDocumentId obbligatori.');
      }

      const body = ctx.request.body || {};
      const order = await loadOrder(documentId, actor.ownerId);

      if (order.status !== 'active') {
        throw appError('ORDER_NOT_ACTIVE', 'Ordine gia chiuso.');
      }

      assertLockVersion(order, body.lock_version);

      // Trova l'item
      const items = order.fk_items || [];
      const item = items.find((i) => i.documentId === itemDocumentId);
      if (!item) throw appError('ITEM_NOT_FOUND', 'Item non trovato.');

      if (item.status !== 'taken') {
        throw appError('ITEM_NOT_EDITABLE', 'Item non piu modificabile (gia in lavorazione).');
      }

      const data = {};
      if (body.quantity !== undefined) {
        const q = parseInt(body.quantity, 10);
        if (!Number.isFinite(q) || q < 1) {
          throw appError('INVALID_PAYLOAD', 'quantity deve essere >= 1.');
        }
        data.quantity = q;
      }
      if (body.notes !== undefined) {
        data.notes = typeof body.notes === 'string' ? body.notes.trim() : null;
      }
      if (Object.keys(data).length === 0) {
        throw appError('INVALID_PAYLOAD', 'Nessun campo da aggiornare.');
      }

      await strapi.documents('api::order-item.order-item').update({
        documentId: itemDocumentId,
        data,
      });

      // Ricalcola totale
      const totalResult = await recalculateTotal(strapi, documentId);

      // Ricarica item aggiornato
      const updatedItems = await strapi.documents('api::order-item.order-item').findMany({
        filters: { documentId: { $eq: itemDocumentId } },
        limit: 1,
      });

      const routingLookup = await loadRoutingMap(strapi, actor.owner);

      ctx.body = {
        data: {
          item: serializeItem(updatedItems && updatedItems[0], routingLookup),
          order: {
            total_amount: totalResult.total,
            lock_version: totalResult.lock_version,
          },
        },
      };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * DELETE /api/orders/:documentId/items/:itemDocumentId
   * Elimina item. Solo se status === 'taken'.
   */
  async deleteItem(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CAMERIERE]);
      const { documentId, itemDocumentId } = ctx.params;
      if (!documentId || !itemDocumentId) {
        throw appError('INVALID_PAYLOAD', 'documentId e itemDocumentId obbligatori.');
      }

      const body = ctx.request.body || {};
      const order = await loadOrder(documentId, actor.ownerId);

      if (order.status !== 'active') {
        throw appError('ORDER_NOT_ACTIVE', 'Ordine gia chiuso.');
      }

      assertLockVersion(order, body.lock_version);

      const items = order.fk_items || [];
      const item = items.find((i) => i.documentId === itemDocumentId);
      if (!item) throw appError('ITEM_NOT_FOUND', 'Item non trovato.');

      if (item.status !== 'taken') {
        throw appError('ITEM_NOT_EDITABLE', 'Item non eliminabile (gia in lavorazione).');
      }

      await strapi.documents('api::order-item.order-item').delete({
        documentId: itemDocumentId,
      });

      // Ricalcola totale
      const totalResult = await recalculateTotal(strapi, documentId);

      ctx.body = {
        data: {
          order: {
            total_amount: totalResult.total,
            lock_version: totalResult.lock_version,
          },
        },
      };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * PATCH /api/orders/:documentId/items/:itemDocumentId/status
   * Transizione stato item (FSM enforced).
   */
  async updateItemStatus(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [
        STAFF_ROLES.OWNER,
        STAFF_ROLES.GESTIONE,
        STAFF_ROLES.CAMERIERE,
        STAFF_ROLES.CUCINA,
        STAFF_ROLES.BAR,
        STAFF_ROLES.PIZZERIA,
        STAFF_ROLES.CUCINA_SG,
      ]);
      const { documentId, itemDocumentId } = ctx.params;
      if (!documentId || !itemDocumentId) {
        throw appError('INVALID_PAYLOAD', 'documentId e itemDocumentId obbligatori.');
      }

      const body = ctx.request.body || {};
      const nextStatus = typeof body.status === 'string' ? body.status : null;
      if (!nextStatus || !ITEM_STATUS_ENUM.includes(nextStatus)) {
        throw appError('INVALID_PAYLOAD', `status richiesto (uno fra ${ITEM_STATUS_ENUM.join(', ')}).`);
      }

      const order = await loadOrder(documentId, actor.ownerId);

      if (order.status !== 'active') {
        throw appError('ORDER_NOT_ACTIVE', 'Ordine gia chiuso.');
      }

      const items = order.fk_items || [];
      const item = items.find((i) => i.documentId === itemDocumentId);
      if (!item) throw appError('ITEM_NOT_FOUND', 'Item non trovato.');

      const station = stationForActor(actor, ctx.request.query || {});
      let routingLookup = null;
      if (station) {
        routingLookup = await loadRoutingMap(strapi, actor.owner);
        const itemStation = routingLookup(item.category || (item.fk_element && item.fk_element.category));
        if (itemStation !== station) {
          throw appError('NOT_OWNER', 'Questo reparto non puo lavorare questa categoria.');
        }
      }

      // FSM check
      const allowed = ITEM_TRANSITIONS[item.status] || [];
      if (!allowed.includes(nextStatus)) {
        throw appError('INVALID_ITEM_TRANSITION',
          `Transizione non ammessa: ${item.status} -> ${nextStatus}.`,
          { from: item.status, to: nextStatus, allowed }
        );
      }

      if (!canTransitionItem(actor, item.status, nextStatus)) {
        throw appError('NOT_OWNER', 'Questo reparto non puo eseguire questa transizione.');
      }

      const updated = await strapi.documents('api::order-item.order-item').update({
        documentId: itemDocumentId,
        data: { status: nextStatus },
      });

      ctx.body = { data: { item: serializeItem(updated, routingLookup) } };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * POST /api/orders/:documentId/close
   * Chiude ordine + pagamento.
   */
  async close(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE]);
      const { documentId } = ctx.params;
      if (!documentId) throw appError('INVALID_PAYLOAD', 'documentId mancante.');

      const body = ctx.request.body || {};
      const paymentMethod = body.payment_method || 'simulator';

      const order = await loadOrder(documentId, actor.ownerId);

      if (order.status !== 'active') {
        throw appError('ORDER_NOT_ACTIVE', 'Ordine gia chiuso.');
      }

      assertLockVersion(order, body.lock_version);

      // Ricalcola totale definitivo
      const items = order.fk_items || [];
      const totalResult = computeTotal({ items });

      if (paymentMethod === 'pos' || paymentMethod === 'fiscal_register') {
        const device = await posBridge.findActiveDeviceForUser(strapi, actor.ownerId);
        if (!device) {
          throw appError(
            'POS_DEVICE_NOT_FOUND',
            'Nessun dispositivo POS/RT collegato. Apri l\'app pos-rt-service e collega il device.',
          );
        }

        const dispatch = await posBridge.dispatchJob(strapi, {
          device,
          user: { id: actor.ownerId },
          kind: 'order.close',
          orderId: documentId,
          priority: 10,
          payload: {
            order_doc_id: documentId,
            amount: totalResult.total,
            subtotal: totalResult.subtotal,
            tax: totalResult.tax,
            discount: totalResult.discount,
            currency: 'EUR',
            payment_method: paymentMethod,
            table: order.fk_table
              ? {
                  documentId: order.fk_table.documentId,
                  number: order.fk_table.number,
                  area: order.fk_table.area,
                }
              : null,
            items: items.map(serializePosJobItem),
          },
        });

        ctx.status = 202;
        ctx.body = {
          data: {
            queued: true,
            event_id: dispatch.event_id,
            delivered_via_ws: dispatch.delivered_via_ws,
            apns_pushed: dispatch.apns_pushed,
            payment: {
              transactionId: dispatch.event_id,
              timestamp: new Date().toISOString(),
              status: 'queued',
            },
          },
        };
        return;
      }

      // Invoca payment service
      let paymentResult;
      try {
        paymentResult = await paymentService.charge({
          amount: totalResult.total,
          currency: 'EUR',
          orderId: documentId,
          method: paymentMethod,
        });
      } catch (payErr) {
        // Rilancia con il codice del payment service
        if (payErr._resCode) throw payErr;
        throw appError('PAYMENT_UNAVAILABLE', payErr.message);
      }

      const dialect = getDialect(strapi);

      // Chiusura atomica: ordine + tavolo + reservation + archive + stats
      await withRetry(async () => {
        return strapi.db.transaction(async ({ trx }) => {
          await beginImmediate(trx, dialect);

          await lockOrderRow(trx, order.id, dialect);

          const orderRows = await trx('orders')
            .where({ id: order.id })
            .select('status', 'lock_version');
          if (orderRows.length === 0 || orderRows[0].status !== 'active') {
            throw appError('ORDER_NOT_ACTIVE', 'Ordine gia chiuso.');
          }

          const closedAtISO = new Date().toISOString();

          await strapi.documents('api::order.order').update({
            documentId,
            data: {
              status: 'closed',
              closed_at: closedAtISO,
              total_amount: totalResult.total,
              payment_status: 'paid',
              payment_reference: paymentResult.transactionId,
              lock_version: (order.lock_version || 0) + 1,
            },
          });

          if (order.fk_table) {
            await strapi.documents('api::table.table').update({
              documentId: order.fk_table.documentId,
              data: { status: 'free' },
            });
          }

          // Se l'ordine e' legato a una prenotazione, promuove a completed.
          // Le transizioni ammesse escludono at_restaurant -> ..., quindi qui
          // chiudiamo sempre se la reservation non e' gia terminale.
          if (order.fk_reservation && order.fk_reservation.documentId) {
            const resStatus = order.fk_reservation.status;
            if (resStatus !== 'completed' && resStatus !== 'cancelled') {
              await strapi.documents('api::reservation.reservation').update({
                documentId: order.fk_reservation.documentId,
                data: { status: 'completed' },
              });
            }
          }

          // Archive + stats: fail-soft (log ma non rollback ordine chiuso).
          // NB: essendo nella stessa tx, un fail qui rolla TUTTO. Per questo
          // catturiamo sotto (fuori della tx) e reinvochiamo best-effort se
          // serve. Qui dentro vogliamo consistency forte: se fallisce,
          // abbiamo fatto rollback e possiamo ritentare.
          try {
            const closedOrder = {
              documentId,
              opened_at: order.opened_at,
              closed_at: closedAtISO,
              total_amount: totalResult.total,
              covers: order.covers || null,
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
              userId: actor.ownerId,
              isWalkin: reservation ? !!reservation.is_walkin : false,
            });

            const dateKey = statsService.dateKeyUTC(closedAtISO);
            const customersCount = (order.covers
              ? parseInt(order.covers, 10)
              : (reservation ? parseInt(reservation.number_of_people, 10) : 0)) || 0;
            const itemsCount = (items || []).reduce(
              (s, it) => s + (parseInt(it.quantity, 10) || 0), 0
            );

            await statsService.updateDailyStat(strapi, {
              userId: actor.ownerId,
              dateKey,
              revenue: totalResult.total,
              customers: customersCount,
              items: itemsCount,
              isWalkin: reservation ? !!reservation.is_walkin : false,
              hasReservation: !!reservation && !reservation.is_walkin,
            });

            await statsService.updateElementStats(strapi, {
              userId: actor.ownerId,
              items,
              timestamp: closedAtISO,
            });
          } catch (statsErr) {
            // Se le stats falliscono, rolliamo l'intera tx. La source of
            // truth (orders + items) resta in DB quando la tx si apre di
            // nuovo su retry. Se persiste, loggamo e rilanciamo.
            strapi.log.error('stats/archive failure durante close order', statsErr);
            throw statsErr;
          }
        });
      }, { maxAttempts: 3 }).catch((err) => {
        if (err && err._resCode) throw err;
        throw appError('ORDER_CONTENTION', 'Contesa DB, riprova.');
      });

      // Ricarica ordine chiuso
      const closed = await loadOrder(documentId, actor.ownerId);

      ctx.body = {
        data: {
          order: serializeOrder(closed, true),
          payment: {
            transactionId: paymentResult.transactionId,
            timestamp: paymentResult.timestamp,
          },
        },
      };
    } catch (err) {
      sendError(ctx, err);
    }
  },
}));
