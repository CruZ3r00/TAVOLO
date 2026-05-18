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
const inventoryService = require('../../../services/inventory');
const {
  STAFF_ROLES,
  KITCHEN_LIKE_ROLES,
  resolveStaffContext,
  assertStaffRole,
  canTransitionItem,
} = require('../../../utils/staff-access');
const {
  normalizeStation,
  ensureCategoryRouting,
  loadRoutingMap,
} = require('../../../utils/category-routing');
const {
  sendTakeawayEmail,
} = require('../../../utils/customer-email');
const {
  TAKEAWAY_STATUSES,
  pickupDueForSend,
  sendToDepartments,
  refreshReadyState,
} = require('../../../utils/takeaway-lifecycle');

const { ApplicationError } = errors;

/* ------------------------------------------------------------------ */
/* FSM item                                                           */
/* ------------------------------------------------------------------ */

const ITEM_TRANSITIONS = {
  pending: ['taken'],
  taken: ['preparing'],
  preparing: ['ready'],
  ready: ['served'],
  served: [],
};

const ITEM_STATUS_ENUM = ['pending', 'taken', 'preparing', 'ready', 'served'];
const ORDER_STATUS_ENUM = ['active', 'closed'];
const SERVICE_TYPE_ENUM = ['table', 'takeaway'];

/* ------------------------------------------------------------------ */
/* Error helpers (allineati a reservation)                            */
/* ------------------------------------------------------------------ */

const ERROR_STATUS = {
  INVALID_PAYLOAD: 400,
  INVALID_ITEM_TRANSITION: 400,
  PAYMENT_DECLINED: 402,
  NOT_OWNER: 403,
  RESTAURANT_NOT_FOUND: 404,
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
  EMAIL_DELIVERY_FAILED: 503,
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
    voided: !!item.voided,
    voided_reason: item.voided_reason || null,
    voided_at: item.voided_at || null,
    station: routingLookup ? routingLookup(category) : null,
    fk_element: item.fk_element ? { documentId: item.fk_element.documentId } : null,
    addons: Array.isArray(item.fk_addons)
      ? item.fk_addons.map((a) => ({
          documentId: a.documentId,
          name: a.name,
          price: Number(a.price) || 0,
          qty_used: a.qty_used !== null && a.qty_used !== undefined ? Number(a.qty_used) : null,
          fk_ingredient: a.fk_ingredient ? { documentId: a.fk_ingredient.documentId } : null,
        }))
      : [],
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function serializeOrder(order, includeItems, routingLookup) {
  if (!order) return null;
  const result = {
    documentId: order.documentId,
    status: order.status,
    service_type: order.service_type || 'table',
    takeaway_status: order.takeaway_status || null,
    customer_name: order.customer_name || null,
    customer_phone: order.customer_phone || null,
    customer_email: order.customer_email || null,
    pickup_at: order.pickup_at || null,
    sent_to_departments_at: order.sent_to_departments_at || null,
    ready_at: order.ready_at || null,
    picked_up_at: order.picked_up_at || null,
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

function serializeBoardItem(item, routingLookup) {
  if (!item) return null;
  const category = item.category || (item.fk_element ? item.fk_element.category : null) || null;
  return {
    documentId: item.documentId,
    name: item.name,
    quantity: item.quantity,
    category,
    course: parseInt(item.course, 10) || 1,
    notes: item.notes || null,
    status: item.status,
    station: routingLookup ? routingLookup(category) : null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function serializeBoardOrder(order, routingLookup) {
  if (!order) return null;
  const items = Array.isArray(order.fk_items) ? order.fk_items : [];
  return {
    documentId: order.documentId,
    status: order.status,
    service_type: order.service_type || 'table',
    takeaway_status: order.takeaway_status || null,
    customer_name: order.customer_name || null,
    pickup_at: order.pickup_at || null,
    sent_to_departments_at: order.sent_to_departments_at || null,
    opened_at: order.opened_at,
    total_amount: order.total_amount,
    lock_version: order.lock_version,
    covers: order.covers || null,
    table: order.fk_table ? {
      documentId: order.fk_table.documentId,
      number: order.fk_table.number,
      seats: order.fk_table.seats,
      area: order.fk_table.area,
      status: order.fk_table.status,
    } : null,
    items: items.map((item) => serializeBoardItem(item, routingLookup)),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function serializeSalaOrder(order) {
  const items = Array.isArray(order && order.fk_items) ? order.fk_items : [];
  return {
    documentId: order.documentId,
    status: order.status,
    service_type: order.service_type || 'table',
    opened_at: order.opened_at,
    total_amount: order.total_amount,
    lock_version: order.lock_version,
    covers: order.covers || null,
    table: order.fk_table ? {
      documentId: order.fk_table.documentId,
      number: order.fk_table.number,
      seats: order.fk_table.seats,
      area: order.fk_table.area,
      status: order.fk_table.status,
    } : null,
    items: items.map((item) => ({
      documentId: item.documentId,
      status: item.status,
      quantity: item.quantity,
      course: parseInt(item.course, 10) || 1,
    })),
    item_count: items.length,
    ready_count: items.filter((item) => item.status === 'ready').length,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
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
    fk_items: { populate: { fk_element: true, fk_addons: { populate: ['fk_ingredient'] } } },
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
 * Carica un elemento menu solo se appartiene all'utente.
 * Element ha fk_user diretto: evitiamo di caricare tutto il menu per una sola riga.
 */
async function loadOwnedMenuElement(documentId, userId) {
  const elements = await strapi.documents('api::element.element').findMany({
    filters: {
      fk_user: { id: { $eq: userId } },
      documentId: { $eq: documentId },
      is_archived: { $ne: true },
    },
    fields: ['id', 'documentId', 'name', 'price', 'category'],
    status: 'published',
    limit: 1,
  });
  const element = elements && elements.length > 0 ? elements[0] : null;
  if (!element) throw appError('INVALID_PAYLOAD', 'Elemento menu non trovato.');
  return element;
}

async function updateOrderTotalFromItems(order, items) {
  const result = computeTotal({ items });
  const lockVersion = (order.lock_version || 0) + 1;
  await strapi.documents('api::order.order').update({
    documentId: order.documentId,
    data: {
      total_amount: result.total,
      lock_version: lockVersion,
    },
    status: 'published',
  });
  return { ...result, lock_version: lockVersion };
}

function archiveClosedOrderBestEffort({ order, items, totalResult, paymentMethod, paymentReference, userId, closedAtISO }) {
  setImmediate(async () => {
    try {
      const reservation = order.fk_reservation || null;
      const table = order.fk_table || null;
      const closedOrder = {
        documentId: order.documentId,
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

      await statsService.archiveClosedOrder(strapi, {
        order: closedOrder,
        items,
        reservation,
        table,
        paymentMethod,
        paymentReference,
        userId,
        isWalkin: reservation ? !!reservation.is_walkin : false,
        isTakeaway: order.service_type === 'takeaway',
      });

      const dateKey = statsService.dateKeyUTC(closedAtISO);
      const customersCount = (
        order.covers
          ? parseInt(order.covers, 10)
          : reservation
            ? parseInt(reservation.number_of_people, 10)
            : 0
      ) || 0;
      const itemsCount = (items || []).reduce(
        (s, it) => (it && it.voided ? s : s + (parseInt(it.quantity, 10) || 0)),
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
    } catch (err) {
      strapi.log.warn(`close order stats/archive best-effort fallito: ${err.message}`);
    }
  });
}

function validateEmail(value, { required = false } = {}) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!email) {
    if (required) throw appError('INVALID_PAYLOAD', 'customer_email obbligatoria.');
    return null;
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw appError('INVALID_PAYLOAD', 'customer_email non valida.');
  }
  return email;
}

function validatePickupAt(body) {
  const date = typeof body.date === 'string' ? body.date.trim() : '';
  const time = typeof body.time === 'string' ? body.time.trim() : '';
  const pickupAtRaw = typeof body.pickup_at === 'string' ? body.pickup_at.trim() : '';
  let pickupAt;

  if (pickupAtRaw) {
    pickupAt = new Date(pickupAtRaw);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}(:\d{2})?$/.test(time)) {
    const normalizedTime = time.length === 5 ? `${time}:00` : time;
    pickupAt = new Date(`${date}T${normalizedTime}`);
  } else {
    throw appError('INVALID_PAYLOAD', 'pickup_at oppure date/time obbligatori.');
  }

  if (!pickupAt || Number.isNaN(pickupAt.getTime())) {
    throw appError('INVALID_PAYLOAD', 'Orario ritiro non valido.');
  }
  if (pickupAt.getTime() < Date.now()) {
    throw appError('INVALID_PAYLOAD', 'Non puoi creare un asporto per un orario passato.');
  }

  return pickupAt.toISOString();
}

function validateTakeawayCustomer(body, { emailRequired = false } = {}) {
  const customer_name = typeof body.customer_name === 'string' ? body.customer_name.trim() : '';
  if (!customer_name) throw appError('INVALID_PAYLOAD', 'customer_name obbligatorio.');
  if (customer_name.length > 120) throw appError('INVALID_PAYLOAD', 'customer_name troppo lungo.');

  const customer_phone = typeof body.customer_phone === 'string'
    ? body.customer_phone.trim()
    : (typeof body.phone === 'string' ? body.phone.trim() : '');
  if (!customer_phone) throw appError('INVALID_PAYLOAD', 'customer_phone obbligatorio.');
  if (customer_phone.length > 32) throw appError('INVALID_PAYLOAD', 'customer_phone troppo lungo.');

  const customer_email = validateEmail(
    body.customer_email !== undefined ? body.customer_email : body.email,
    { required: emailRequired }
  );

  return { customer_name, customer_phone, customer_email };
}

async function buildOrderItemDataFromPayload(payload, ownerId, orderId) {
  let itemName, itemPrice, itemCategory, menuElement;

  if (payload.element_id) {
    menuElement = await loadOwnedMenuElement(payload.element_id, ownerId);
    itemName = menuElement.name;
    itemPrice = menuElement.price;
    itemCategory = menuElement.category || null;
  } else {
    itemName = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!itemName) throw appError('INVALID_PAYLOAD', 'name obbligatorio per item fuori menu.');
    if (itemName.length > 200) throw appError('INVALID_PAYLOAD', 'name troppo lungo (max 200).');

    itemPrice = parseFloat(payload.price);
    if (!Number.isFinite(itemPrice) || itemPrice < 0) {
      throw appError('INVALID_PAYLOAD', 'price obbligatorio e deve essere >= 0.');
    }
    itemCategory = typeof payload.category === 'string' ? payload.category.trim() : null;
    if (itemCategory && itemCategory.length > 100) {
      throw appError('INVALID_PAYLOAD', 'category troppo lunga (max 100).');
    }
  }

  const quantity = parseInt(payload.quantity, 10);
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw appError('INVALID_PAYLOAD', 'quantity obbligatoria (intero >= 1).');
  }

  const course = payload.course !== undefined ? parseInt(payload.course, 10) : 1;
  if (!Number.isFinite(course) || course < 1 || course > 12) {
    throw appError('INVALID_PAYLOAD', 'course deve essere un intero 1..12.');
  }

  const notes = typeof payload.notes === 'string' ? payload.notes.trim() : null;

  const data = {
    name: itemName,
    price: itemPrice,
    quantity,
    category: itemCategory || null,
    course,
    notes: notes && notes.length > 0 ? notes : null,
    // Dine-in: 'pending' = cameriere only, visibile in cucina solo dopo
    //   "Invia in cucina" che avanza a 'taken'. Vedi sendDineInToDepartments.
    // Takeaway: gating al livello Order.takeaway_status; il valore qui usato
    //   non blocca la visibilita' in cucina, ma teniamo 'pending' coerente
    //   per la prima fase pre-accettazione.
    status: 'pending',
    fk_order: { connect: [{ id: orderId }] },
  };
  if (menuElement) {
    data.fk_element = { connect: [{ id: menuElement.id }] };
  }
  if (data.category) {
    await ensureCategoryRouting(strapi, ownerId, data.category);
  }
  return data;
}

async function restaurantNameForOwner(ownerId) {
  const configs = await strapi.documents('api::website-config.website-config').findMany({
    filters: { fk_user: { id: { $eq: ownerId } } },
    limit: 1,
  });
  const wc = configs && configs.length > 0 ? configs[0] : null;
  return wc && wc.restaurant_name ? wc.restaurant_name : 'Tavolo';
}

async function deleteOrderWithItems(order) {
  if (!order || !order.documentId) return;
  const items = Array.isArray(order.fk_items) ? order.fk_items : [];
  for (const item of items) {
    if (item && item.documentId) {
      await strapi.documents('api::order-item.order-item').delete({ documentId: item.documentId });
    }
  }
  await strapi.documents('api::order.order').delete({ documentId: order.documentId });
}

async function createTakeawayOrder({ ownerId, body, status, emailRequired }) {
  const customer = validateTakeawayCustomer(body, { emailRequired });
  const pickupAt = validatePickupAt(body);
  const itemsPayload = Array.isArray(body.items) ? body.items : [];
  if (itemsPayload.length === 0) {
    throw appError('INVALID_PAYLOAD', 'Aggiungi almeno un piatto all\'ordine asporto.');
  }
  if (itemsPayload.length > 200) {
    throw appError('INVALID_PAYLOAD', 'Troppi elementi asporto (max 200).');
  }

  let order;
  try {
    order = await strapi.documents('api::order.order').create({
      data: {
        status: 'active',
        service_type: 'takeaway',
        takeaway_status: status,
        customer_name: customer.customer_name,
        customer_phone: customer.customer_phone,
        customer_email: customer.customer_email,
        pickup_at: pickupAt,
        opened_at: new Date().toISOString(),
        total_amount: 0,
        payment_status: 'unpaid',
        lock_version: 0,
        covers: null,
        fk_user: { connect: [{ id: ownerId }] },
      },
    });

    for (const payload of itemsPayload) {
      const itemData = await buildOrderItemDataFromPayload(payload || {}, ownerId, order.id);
      await strapi.documents('api::order-item.order-item').create({ data: itemData });
    }

    await recalculateTotal(strapi, order.documentId);
  } catch (err) {
    if (order) {
      const partial = await loadOrder(order.documentId, ownerId).catch(() => ({ ...order, fk_items: [] }));
      await deleteOrderWithItems(partial).catch((cleanupErr) => {
        strapi.log.error(`cleanup asporto parziale fallito: ${cleanupErr.message}`);
      });
    }
    throw err;
  }

  let full = await loadOrder(order.documentId, ownerId);
  if (status === 'confirmed' && pickupDueForSend(full)) {
    await sendToDepartments(strapi, full);
    full = await loadOrder(order.documentId, ownerId);
  }
  return full;
}

function serializePosJobItem(item) {
  const result = {
    name: item.name,
    quantity: parseInt(item.quantity, 10) || 1,
    price: Number(item.price || 0),
    category: item.category || (item.fk_element ? item.fk_element.category : null) || null,
    course: parseInt(item.course, 10) || 1,
    notes: item.notes || null,
    element_document_id: item.fk_element ? item.fk_element.documentId : null,
  };
  if (Array.isArray(item.fk_addons) && item.fk_addons.length > 0) {
    result.addons = item.fk_addons
      .filter((a) => a && a.name)
      .map((a) => ({
        name: a.name,
        price: Number(a.price || 0),
        qty_used: a.qty_used != null ? Number(a.qty_used) : undefined,
      }));
  }
  return result;
}

function buildKitchenTicketPayload({ order, item, station, action }) {
  const serviceType = order.service_type || 'table';
  return {
    action,
    station: station || null,
    title: action === 'cancel'
      ? 'ANNULLA COMANDA'
      : action === 'update'
        ? 'MODIFICA COMANDA'
        : 'COMANDA',
    printed_at: new Date().toISOString(),
    order: {
      documentId: order.documentId,
      service_type: serviceType,
      opened_at: order.opened_at || null,
    },
    table: order.fk_table
      ? {
          documentId: order.fk_table.documentId,
          number: order.fk_table.number,
          area: order.fk_table.area || null,
        }
      : null,
    takeaway: serviceType === 'takeaway'
      ? {
          customer_name: order.customer_name || null,
          pickup_at: order.pickup_at || null,
        }
      : null,
    items: [serializePosJobItem(item)],
  };
}

function queueKitchenTicketPrint({ actor, order, item, station, action }) {
  setImmediate(async () => {
    try {
      if (!actor || !actor.ownerId || !order || !item) return;
      const device = await posBridge.findActiveDeviceForUser(strapi, actor.ownerId);
      if (!device) {
        strapi.log.info(`print.kitchen_ticket: nessun device POS/RT attivo per user ${actor.ownerId}`);
        return;
      }
      await posBridge.dispatchJob(strapi, {
        device,
        user: { id: actor.ownerId },
        kind: 'print.kitchen_ticket',
        orderId: order.documentId,
        priority: 20,
        payload: buildKitchenTicketPayload({ order, item, station, action }),
      });
    } catch (err) {
      strapi.log.warn(`print.kitchen_ticket: enqueue fallito per ordine ${order && order.documentId}: ${err.message}`);
    }
  });
}

/**
 * Costruisce il payload per una comanda bulk (piu' item per stazione).
 * Usata dal trigger in sendDineInToDepartments.
 */
function buildKitchenTicketBulkPayload({ order, items, station, action = 'add' }) {
  const serviceType = order.service_type || 'table';
  return {
    action,
    station: station || null,
    title: 'COMANDA',
    printed_at: new Date().toISOString(),
    order: {
      documentId: order.documentId,
      service_type: serviceType,
      opened_at: order.opened_at || null,
    },
    table: order.fk_table
      ? {
          documentId: order.fk_table.documentId,
          number: order.fk_table.number,
          area: order.fk_table.area || null,
        }
      : null,
    takeaway: serviceType === 'takeaway'
      ? {
          customer_name: order.customer_name || null,
          pickup_at: order.pickup_at || null,
        }
      : null,
    items: items.map(serializePosJobItem),
  };
}

/**
 * Accoda la stampa comande bulk raggruppate per stazione.
 * Chiamata da sendDineInToDepartments dopo l'avanzamento pending → taken.
 *
 * Ritorna { attempted, queued, no_device } — usato nella response meta.
 * NON usa setImmediate perche' il risultato serve nella response HTTP.
 */
async function queueKitchenTicketBulkPrint({ actor, order, items, routingLookup }) {
  const result = { attempted: 0, queued: 0, no_device: false };
  try {
    if (!actor || !actor.ownerId || !order || !items || items.length === 0) return result;

    // Carica config stampanti per verificare auto_print_kitchen_enabled
    const printerConfigService = require('../../../api/restaurant-printer-config/services/restaurant-printer-config');
    const printerConfig = await printerConfigService.loadForUser(actor.ownerId);

    // Se la stampa automatica e' disattivata, non accodare nulla
    if (printerConfig && printerConfig.auto_print_kitchen_enabled === false) {
      return result;
    }

    const device = await posBridge.findActiveDeviceForUser(strapi, actor.ownerId);
    if (!device) {
      strapi.log.info(`print.kitchen_ticket bulk: nessun device POS/RT attivo per user ${actor.ownerId}`);
      result.no_device = true;
      return result;
    }

    // Raggruppa items per stazione
    const stationGroups = new Map();
    for (const item of items) {
      const cat = item.category || (item.fk_element ? item.fk_element.category : null);
      const station = routingLookup(cat) || 'cucina';
      if (!stationGroups.has(station)) stationGroups.set(station, []);
      stationGroups.get(station).push(item);
    }

    // Accoda un job per ogni stazione
    for (const [station, stationItems] of stationGroups) {
      result.attempted += 1;
      try {
        await posBridge.dispatchJob(strapi, {
          device,
          user: { id: actor.ownerId },
          kind: 'print.kitchen_ticket',
          orderId: order.documentId,
          priority: 20,
          payload: {
            target: { role: 'station', key: station },
            ...buildKitchenTicketBulkPayload({ order, items: stationItems, station }),
          },
        });
        result.queued += 1;
      } catch (err) {
        strapi.log.warn(`print.kitchen_ticket bulk: enqueue fallito per stazione ${station}: ${err.message}`);
      }
    }
  } catch (err) {
    strapi.log.warn(`print.kitchen_ticket bulk: errore generico per ordine ${order && order.documentId}: ${err.message}`);
  }
  return result;
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
  const {
    ownerId,
    station,
    statusFilter,
    serviceTypeFilter,
    tableFilter,
    from,
    to,
    pickupFrom,
    pickupTo,
    linkedFilter,
    page,
    pageSize,
  } = params;
  const conn = strapi.db.connection;

  const applyFilters = (q) => {
    let query = q
      .innerJoin('orders_fk_user_lnk as ul', 'ul.order_id', 'o.id')
      .innerJoin('order_items_fk_order_lnk as il', 'il.order_id', 'o.id')
      .innerJoin('order_items as oi', 'oi.id', 'il.order_item_id')
      .innerJoin('restaurant_category_routing as rcr', 'rcr.owner_id', 'ul.user_id')
      .whereRaw('rcr.category_key = LOWER(TRIM(oi.category))')
      .where('ul.user_id', ownerId)
      .where('rcr.staff_role', station)
      .where('oi.status', '<>', 'served')
      .andWhere(function () {
        this.where(function () {
          this.where(function () {
            this.whereNull('o.service_type').orWhere('o.service_type', 'table');
          });
        }).orWhere(function () {
          this.where('o.service_type', 'takeaway')
            .whereNotNull('o.sent_to_departments_at')
            .whereIn('o.takeaway_status', ['sent_to_departments', 'ready']);
        });
      });

    if (statusFilter && statusFilter.length) {
      query = query.whereIn('o.status', statusFilter);
    }
    if (serviceTypeFilter) {
      query = query.where('o.service_type', serviceTypeFilter);
    }
    if (tableFilter) {
      query = query
        .innerJoin('orders_fk_table_lnk as tl', 'tl.order_id', 'o.id')
        .innerJoin('tables as t', 't.id', 'tl.table_id')
        .where('t.document_id', tableFilter);
    }
    if (from) query = query.where('o.opened_at', '>=', from);
    if (to) query = query.where('o.opened_at', '<', to);
    if (pickupFrom) query = query.where('o.pickup_at', '>=', pickupFrom);
    if (pickupTo) query = query.where('o.pickup_at', '<', pickupTo);

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
              service_type: 'table',
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

          return {
            ...orderDoc,
            fk_table: {
              documentId: tableDocId,
              status: 'occupied',
            },
            fk_items: [],
          };
        });
      }, { maxAttempts: 3 }).catch((err) => {
        if (err && err._resCode) throw err;
        throw appError('ORDER_CONTENTION', 'Contesa DB, riprova.');
      });

      ctx.status = 201;
      ctx.body = { data: serializeOrder(created, true) };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * POST /api/takeaways
   * Crea un ordine asporto dal gestionale. Nasce sempre confermato.
   */
  async createTakeawayAuthenticated(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CAMERIERE]);
      const full = await createTakeawayOrder({
        ownerId: actor.ownerId,
        body: ctx.request.body || {},
        status: 'confirmed',
        emailRequired: false,
      });
      const routingLookup = await loadRoutingMap(strapi, actor.owner);

      ctx.status = 201;
      ctx.body = { data: serializeOrder(full, true, routingLookup) };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * POST /api/takeaways/public/:userDocumentId
   * Crea una richiesta asporto pubblica, in attesa di accettazione.
   */
  async createTakeawayPublic(ctx) {
    try {
      const { userDocumentId } = ctx.params;
      if (!userDocumentId) throw appError('INVALID_PAYLOAD', 'userDocumentId mancante.');

      const users = await strapi.db
        .query('plugin::users-permissions.user')
        .findMany({ where: { documentId: userDocumentId }, limit: 1 });
      if (!users || users.length === 0) {
        throw appError('RESTAURANT_NOT_FOUND', 'Ristorante non trovato.');
      }
      const targetUser = users[0];
      const full = await createTakeawayOrder({
        ownerId: targetUser.id,
        body: ctx.request.body || {},
        status: 'pending_acceptance',
        emailRequired: true,
      });

      try {
        await sendTakeawayEmail(strapi, {
          order: full,
          restaurantName: await restaurantNameForOwner(targetUser.id),
          type: 'received',
        });
      } catch (emailErr) {
        await deleteOrderWithItems(full).catch((cleanupErr) => {
          strapi.log.error(`cleanup asporto pubblico fallito: ${cleanupErr.message}`);
        });
        throw emailErr;
      }

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
      const serviceTypeFilter = typeof q.service_type === 'string' && SERVICE_TYPE_ENUM.includes(q.service_type.trim())
        ? q.service_type.trim()
        : null;
      const takeawayStatusFilter = typeof q.takeaway_status === 'string' && q.takeaway_status.trim()
        ? q.takeaway_status.split(',').map((s) => s.trim()).filter((s) => TAKEAWAY_STATUSES.includes(s))
        : null;

      const tableFilter = typeof q.table === 'string' && q.table.trim() ? q.table.trim() : null;

      const from = typeof q.from === 'string' && q.from.trim() ? q.from.trim() : null;
      const to = typeof q.to === 'string' && q.to.trim() ? q.to.trim() : null;
      const pickupFrom = typeof q.pickup_from === 'string' && q.pickup_from.trim() ? q.pickup_from.trim() : null;
      const pickupTo = typeof q.pickup_to === 'string' && q.pickup_to.trim() ? q.pickup_to.trim() : null;
      if (from && Number.isNaN(new Date(from).getTime())) {
        throw appError('INVALID_PAYLOAD', 'from non valido.');
      }
      if (to && Number.isNaN(new Date(to).getTime())) {
        throw appError('INVALID_PAYLOAD', 'to non valido.');
      }
      if (pickupFrom && Number.isNaN(new Date(pickupFrom).getTime())) {
        throw appError('INVALID_PAYLOAD', 'pickup_from non valido.');
      }
      if (pickupTo && Number.isNaN(new Date(pickupTo).getTime())) {
        throw appError('INVALID_PAYLOAD', 'pickup_to non valido.');
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
      if (serviceTypeFilter) {
        filters.service_type = { $eq: serviceTypeFilter };
      }
      if (takeawayStatusFilter && takeawayStatusFilter.length) {
        filters.takeaway_status = { $in: takeawayStatusFilter };
      }
      if (tableFilter) {
        filters.fk_table = { documentId: { $eq: tableFilter } };
      }
      if (from || to) {
        filters.opened_at = {};
        if (from) filters.opened_at.$gte = from;
        if (to) filters.opened_at.$lt = to;
      }
      if (pickupFrom || pickupTo) {
        filters.pickup_at = {};
        if (pickupFrom) filters.pickup_at.$gte = pickupFrom;
        if (pickupTo) filters.pickup_at.$lt = pickupTo;
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
          serviceTypeFilter,
          tableFilter,
          from,
          to,
          pickupFrom,
          pickupTo,
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
              fk_items: { populate: { fk_element: true, fk_addons: { populate: ['fk_ingredient'] } } },
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
              fk_items: { populate: { fk_element: true, fk_addons: { populate: ['fk_ingredient'] } } },
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
   * GET /api/orders/board
   * Payload leggero per board operative owner/reparti.
   */
  async board(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [
        STAFF_ROLES.OWNER,
        STAFF_ROLES.GESTIONE,
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
        : ['active'];
      const serviceTypeFilter = typeof q.service_type === 'string' && SERVICE_TYPE_ENUM.includes(q.service_type.trim())
        ? q.service_type.trim()
        : null;
      const pageRaw = parseInt(q.page, 10);
      const pageSizeRaw = parseInt(q.pageSize, 10);
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
      const pageSize = Math.min(
        Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? pageSizeRaw : DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE
      );

      const routingLookup = await loadRoutingMap(strapi, actor.owner);
      let results = [];
      let total = 0;

      if (station) {
        const { ids, total: filteredTotal } = await listOrderIdsForStation(strapi, {
          ownerId,
          station,
          statusFilter,
          serviceTypeFilter,
          tableFilter: null,
          from: null,
          to: null,
          pickupFrom: null,
          pickupTo: null,
          linkedFilter: null,
          page,
          pageSize,
        });
        total = filteredTotal;
        if (ids.length > 0) {
          const populated = await strapi.documents('api::order.order').findMany({
            filters: { id: { $in: ids } },
            populate: {
              fk_table: true,
              fk_items: { populate: { fk_element: true } },
            },
            sort: ['opened_at:desc'],
            pagination: { page: 1, pageSize: ids.length },
          });
          results = (populated || []).map((o) => filterItemsForStation(o, routingLookup, station));
        }
      } else {
        const filters = { fk_user: { id: { $eq: ownerId } } };
        if (statusFilter && statusFilter.length) filters.status = { $in: statusFilter };
        if (serviceTypeFilter) filters.service_type = { $eq: serviceTypeFilter };
        const [findResults, countTotal] = await Promise.all([
          strapi.documents('api::order.order').findMany({
            filters,
            populate: {
              fk_table: true,
              fk_items: { populate: { fk_element: true } },
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
        data: results.map((o) => serializeBoardOrder(o, routingLookup)),
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
   * GET /api/orders/sala
   * Payload leggero per griglia sala/cameriere.
   */
  async sala(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CAMERIERE]);
      const ownerId = actor.ownerId;

      const [tables, orders, readyTakeaways] = await Promise.all([
        strapi.documents('api::table.table').findMany({
          filters: { fk_user: { id: { $eq: ownerId } } },
          sort: ['number:asc'],
        }),
        strapi.documents('api::order.order').findMany({
          filters: {
            fk_user: { id: { $eq: ownerId } },
            status: { $eq: 'active' },
            service_type: { $eq: 'table' },
          },
          populate: {
            fk_table: true,
            fk_items: { fields: ['documentId', 'status', 'quantity', 'course'] },
          },
          sort: ['opened_at:desc'],
          pagination: { page: 1, pageSize: MAX_PAGE_SIZE },
        }),
        strapi.documents('api::order.order').findMany({
          filters: {
            fk_user: { id: { $eq: ownerId } },
            status: { $eq: 'active' },
            service_type: { $eq: 'takeaway' },
            takeaway_status: { $eq: 'ready' },
          },
          fields: [
            'documentId',
            'status',
            'service_type',
            'takeaway_status',
            'customer_name',
            'customer_phone',
            'pickup_at',
            'opened_at',
            'total_amount',
            'lock_version',
          ],
          sort: ['pickup_at:asc'],
          pagination: { page: 1, pageSize: MAX_PAGE_SIZE },
        }),
      ]);

      ctx.body = {
        data: {
          tables: (tables || []).map((table) => ({
            documentId: table.documentId,
            number: table.number,
            seats: table.seats,
            area: table.area || 'interno',
            status: table.status || 'free',
            createdAt: table.createdAt,
            updatedAt: table.updatedAt,
          })),
          orders: [
            ...(orders || []).map(serializeSalaOrder),
            ...(readyTakeaways || []).map((order) => ({
              documentId: order.documentId,
              status: order.status,
              service_type: order.service_type || 'takeaway',
              takeaway_status: order.takeaway_status || null,
              customer_name: order.customer_name || null,
              customer_phone: order.customer_phone || null,
              pickup_at: order.pickup_at || null,
              opened_at: order.opened_at,
              total_amount: order.total_amount,
              lock_version: order.lock_version,
              items: [],
              createdAt: order.createdAt,
              updatedAt: order.updatedAt,
            })),
          ],
        },
        meta: {
          tables: (tables || []).length,
          orders: (orders || []).length,
          readyTakeaways: (readyTakeaways || []).length,
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
      if (order.service_type === 'takeaway' && order.sent_to_departments_at) {
        throw appError('ITEM_NOT_EDITABLE', 'Asporto gia inviato ai reparti, non modificabile.');
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

      // Crea item con status 'pending': il cameriere lo "tiene" sul tavolo
      // (modificabile/cancellabile) finche' non preme "Invia in cucina", che
      // avanza pending → taken e lo rende visibile alla KitchenBoard.
      const itemData = {
        name: itemName,
        price: itemPrice,
        quantity,
        category: itemCategory || null,
        course,
        notes: notes && notes.length > 0 ? notes : null,
        status: 'pending',
        fk_order: { connect: [{ id: order.id }] },
      };

      if (menuElement) {
        itemData.fk_element = { connect: [{ id: menuElement.id }] };
      }
      if (itemData.category) {
        await ensureCategoryRouting(strapi, actor.ownerId, itemData.category);
      }

      const createdItem = await strapi.documents('api::order-item.order-item').create({
        data: itemData,
      });

      // --- Addon processing ---
      const rawAddons = Array.isArray(body.addons) ? body.addons.slice(0, 10) : [];
      const createdAddons = [];
      if (rawAddons.length > 0) {
        const ownerRow = await strapi.db.query('plugin::users-permissions.user').findOne({
          where: { id: actor.ownerId },
          select: ['id', 'subscription_plan'],
        });
        const isStarterPlan = !ownerRow || String(ownerRow.subscription_plan || '').toLowerCase() !== 'pro';

        for (const addon of rawAddons) {
          const ingDocId = addon.ingredient_id;
          if (!ingDocId) continue;

          const ingResults = await strapi.documents('api::ingredient.ingredient').findMany({
            filters: {
              documentId: { $eq: ingDocId },
              fk_user: { id: { $eq: actor.ownerId } },
              is_addon: { $eq: true },
              is_active: { $ne: false },
            },
            fields: ['id', 'documentId', 'name', 'addon_price', 'addon_avg_qty', 'stock_qty'],
            limit: 1,
          });
          const ing = ingResults && ingResults[0];
          if (!ing) continue;

          const snapshotPrice = Number(ing.addon_price) || 0;
          let qtyUsed = null;
          if (!isStarterPlan) {
            qtyUsed = addon.qty_used !== undefined && addon.qty_used !== null
              ? Number(addon.qty_used)
              : (Number(ing.addon_avg_qty) || null);
          }

          const addonRecord = await strapi.documents('api::order-item-addon.order-item-addon').create({
            data: {
              name: ing.name,
              price: snapshotPrice,
              qty_used: qtyUsed,
              fk_ingredient: { connect: [{ id: ing.id }] },
              fk_order_item: { connect: [{ id: createdItem.id }] },
            },
          });
          createdAddons.push(addonRecord);
        }
      }
      // --- Fine addon processing ---

      // Ricarica item con addons se presenti (serve per il totale)
      let itemForTotal = createdItem;
      if (createdAddons.length > 0) {
        itemForTotal = await strapi.documents('api::order-item.order-item').findOne({
          documentId: createdItem.documentId,
          populate: { fk_addons: { populate: ['fk_ingredient'] } },
        });
      }

      const totalResult = await updateOrderTotalFromItems(order, [
        ...(order.fk_items || []),
        itemForTotal,
      ]);

      const routingLookup = await loadRoutingMap(strapi, actor.owner);
      // Stampa comanda rimossa da addItem: la comanda parte solo al click
      // "Invia in cucina" (sendDineInToDepartments) in modalita' bulk.

      ctx.status = 201;
      ctx.body = {
        data: {
          item: serializeItem(itemForTotal, routingLookup),
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
   * Aggiorna quantity/notes. Solo se item.status === 'pending' e order.status === 'active'.
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
      if (order.service_type === 'takeaway' && order.sent_to_departments_at) {
        throw appError('ITEM_NOT_EDITABLE', 'Asporto gia inviato ai reparti, non modificabile.');
      }

      assertLockVersion(order, body.lock_version);

      // Trova l'item
      const items = order.fk_items || [];
      const item = items.find((i) => i.documentId === itemDocumentId);
      if (!item) throw appError('ITEM_NOT_FOUND', 'Item non trovato.');

      if (item.status !== 'pending') {
        throw appError('ITEM_NOT_EDITABLE', 'Item non piu modificabile (gia inviato in cucina).');
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

      const hasAddonsField = body.addons !== undefined;
      if (Object.keys(data).length === 0 && !hasAddonsField) {
        throw appError('INVALID_PAYLOAD', 'Nessun campo da aggiornare.');
      }

      let updatedItem = item;
      if (Object.keys(data).length > 0) {
        updatedItem = await strapi.documents('api::order-item.order-item').update({
          documentId: itemDocumentId,
          data,
        });
      }

      // Gestione addons: se passato l'array, sostituisci completamente
      // gli addon attuali (cancellazione + ricreazione con snapshot).
      if (hasAddonsField) {
        const rawAddons = Array.isArray(body.addons) ? body.addons.slice(0, 10) : [];

        // Cancella addon esistenti dell'item (cascade manuale).
        await strapi.db.query('api::order-item-addon.order-item-addon').deleteMany({
          where: { fk_order_item: { id: item.id } },
        });

        if (rawAddons.length > 0) {
          const ownerRow = await strapi.db.query('plugin::users-permissions.user').findOne({
            where: { id: actor.ownerId },
            select: ['id', 'subscription_plan'],
          });
          const isStarterPlan = !ownerRow || String(ownerRow.subscription_plan || '').toLowerCase() !== 'pro';

          for (const addon of rawAddons) {
            const ingDocId = addon.ingredient_id;
            if (!ingDocId) continue;

            const ingResults = await strapi.documents('api::ingredient.ingredient').findMany({
              filters: {
                documentId: { $eq: ingDocId },
                fk_user: { id: { $eq: actor.ownerId } },
                is_addon: { $eq: true },
                is_active: { $ne: false },
              },
              fields: ['id', 'documentId', 'name', 'addon_price', 'addon_avg_qty', 'stock_qty'],
              limit: 1,
            });
            const ing = ingResults && ingResults[0];
            if (!ing) continue;

            const snapshotPrice = Number(ing.addon_price) || 0;
            let qtyUsed = null;
            if (!isStarterPlan) {
              qtyUsed = addon.qty_used !== undefined && addon.qty_used !== null
                ? Number(addon.qty_used)
                : (Number(ing.addon_avg_qty) || null);
            }

            await strapi.documents('api::order-item-addon.order-item-addon').create({
              data: {
                name: ing.name,
                price: snapshotPrice,
                qty_used: qtyUsed,
                fk_ingredient: { connect: [{ id: ing.id }] },
                fk_order_item: { connect: [{ id: item.id }] },
              },
            });
          }
        }

        // Ricarica item con addons aggiornati per il totale e la response.
        updatedItem = await strapi.documents('api::order-item.order-item').findOne({
          documentId: itemDocumentId,
          populate: { fk_addons: { populate: ['fk_ingredient'] }, fk_element: true },
        });
      }

      const nextItems = items.map((current) => (
        current.documentId === itemDocumentId ? { ...current, ...updatedItem } : current
      ));
      const totalResult = await updateOrderTotalFromItems(order, nextItems);

      const routingLookup = await loadRoutingMap(strapi, actor.owner);
      // Stampa comanda rimossa da updateItem: la comanda parte solo al click
      // "Invia in cucina" (sendDineInToDepartments) in modalita' bulk.

      ctx.body = {
        data: {
          item: serializeItem(updatedItem, routingLookup),
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
   * Elimina item. Solo se status === 'pending'.
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
      if (order.service_type === 'takeaway' && order.sent_to_departments_at) {
        throw appError('ITEM_NOT_EDITABLE', 'Asporto gia inviato ai reparti, non modificabile.');
      }

      assertLockVersion(order, body.lock_version);

      const items = order.fk_items || [];
      const item = items.find((i) => i.documentId === itemDocumentId);
      if (!item) throw appError('ITEM_NOT_FOUND', 'Item non trovato.');

      if (item.status !== 'pending') {
        throw appError('ITEM_NOT_EDITABLE', 'Item non eliminabile (gia inviato in cucina).');
      }

      // Cascade delete addons dell'item
      await strapi.db.query('api::order-item-addon.order-item-addon').deleteMany({
        where: { fk_order_item: { id: item.id } },
      });

      await strapi.documents('api::order-item.order-item').delete({
        documentId: itemDocumentId,
      });

      const totalResult = await updateOrderTotalFromItems(
        order,
        items.filter((current) => current.documentId !== itemDocumentId)
      );

      const routingLookup = await loadRoutingMap(strapi, actor.owner);
      queueKitchenTicketPrint({
        actor,
        order,
        item,
        station: routingLookup(item.category || (item.fk_element && item.fk_element.category)),
        action: 'cancel',
      });

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
      if (order.service_type === 'takeaway' && !order.sent_to_departments_at) {
        throw appError('ORDER_NOT_ACTIVE', 'Asporto non ancora inviato ai reparti.');
      }

      const items = order.fk_items || [];
      const item = items.find((i) => i.documentId === itemDocumentId);
      if (!item) throw appError('ITEM_NOT_FOUND', 'Item non trovato.');
      if (order.service_type === 'takeaway' && nextStatus === 'served') {
        throw appError('INVALID_ITEM_TRANSITION', 'Usa "Preso dalla cucina" per ritirare un asporto pronto.');
      }

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

      const updateData = { status: nextStatus };
      if (nextStatus === 'served') {
        updateData.served_at = new Date();
      }
      const updated = await strapi.documents('api::order-item.order-item').update({
        documentId: itemDocumentId,
        data: updateData,
      });
      if (order.service_type === 'takeaway' && nextStatus === 'ready') {
        await refreshReadyState(strapi, documentId);
      }

      // Hook inventory: scarico magazzino al passaggio served (dine-in).
      // Fail-soft: errori loggati ma non rilanciati (NON deve bloccare la FSM).
      if (nextStatus === 'served') {
        setImmediate(async () => {
          try {
            await inventoryService.applyOnServe(strapi, updated);
          } catch (invErr) {
            strapi.log.warn(`order.updateItemStatus: inventory.applyOnServe fallito per item ${itemDocumentId}: ${invErr.message}`);
          }
        });
      }

      ctx.body = { data: { item: serializeItem(updated, routingLookup) } };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * PATCH /api/orders/:documentId/items/:itemDocumentId/void
   * Annullamento item gia' in lavorazione/servito (cameriere+).
   * - Marca voided=true, voided_reason, voided_at.
   * - Se item era served: invoca inventory.applyOnVoid (compensativo).
   * - Incrementa RestaurantDailyStat.voided_count / voided_revenue_lost.
   * - Ricalcola order.total_amount (computeTotal esclude voided).
   *
   * Differisce da deleteItem: il record viene preservato in DB con flag,
   * sia per audit che per ripristino della stock via movimenti compensativi.
   */
  async voidItem(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CAMERIERE]);
      const { documentId, itemDocumentId } = ctx.params;
      if (!documentId || !itemDocumentId) {
        throw appError('INVALID_PAYLOAD', 'documentId e itemDocumentId obbligatori.');
      }

      const raw = ctx.request.body || {};
      const body = raw.data && typeof raw.data === 'object' ? raw.data : raw;
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!reason || reason.length < 2) {
        throw appError('INVALID_PAYLOAD', 'reason obbligatoria (min 2 caratteri).');
      }
      if (reason.length > 500) {
        throw appError('INVALID_PAYLOAD', 'reason troppo lunga (max 500).');
      }

      const order = await loadOrder(documentId, actor.ownerId);
      if (order.status !== 'active') {
        throw appError('ORDER_NOT_ACTIVE', 'Ordine gia chiuso.');
      }

      assertLockVersion(order, body.lock_version);

      const items = order.fk_items || [];
      const item = items.find((i) => i.documentId === itemDocumentId);
      if (!item) throw appError('ITEM_NOT_FOUND', 'Item non trovato.');
      if (item.voided) {
        throw appError('ITEM_NOT_EDITABLE', 'Item gia annullato.');
      }

      const wasServed = item.status === 'served';
      const voidedAt = new Date();
      const price = parseFloat(item.price) || 0;
      const qty = parseInt(item.quantity, 10) || 0;
      const lostRevenue = Math.round(price * qty * 100) / 100;

      const updated = await strapi.documents('api::order-item.order-item').update({
        documentId: itemDocumentId,
        data: {
          voided: true,
          voided_reason: reason,
          voided_at: voidedAt,
        },
      });

      // Hook inventory compensativo: solo se l'item era gia served
      // (ovvero applyOnServe era stato chiamato e ci sono movimenti).
      // Fail-soft: non bloccare il flusso utente per errori magazzino.
      if (wasServed) {
        try {
          await inventoryService.applyOnVoid(strapi, updated);
        } catch (invErr) {
          strapi.log.warn(`order.voidItem: inventory.applyOnVoid fallito item ${itemDocumentId}: ${invErr.message}`);
        }
      }

      // Aggiorna RestaurantDailyStat (data del void in UTC). Fail-soft.
      try {
        const dateKey = statsService.dateKeyUTC(voidedAt.toISOString());
        await statsService.bumpVoided(strapi, {
          userId: actor.ownerId,
          dateKey,
          count: 1,
          revenueLost: lostRevenue,
        });
      } catch (statErr) {
        strapi.log.warn(`order.voidItem: bumpVoided fallito: ${statErr.message}`);
      }

      // Ricalcola totale ordine (computeTotal esclude items voided).
      const totalResult = await recalculateTotal(strapi, documentId);

      let routingLookup = null;
      try { routingLookup = await loadRoutingMap(strapi, actor.owner); }
      catch (_e) { routingLookup = () => null; }

      ctx.body = {
        data: {
          item: serializeItem(updated, routingLookup),
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
   * PATCH /api/takeaways/:documentId
   * Modifica dati cliente/orario finche l'asporto non e' stato inviato.
   */
  async updateTakeaway(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CAMERIERE]);
      const { documentId } = ctx.params;
      if (!documentId) throw appError('INVALID_PAYLOAD', 'documentId mancante.');

      const order = await loadOrder(documentId, actor.ownerId);
      if (order.service_type !== 'takeaway') throw appError('ORDER_NOT_FOUND', 'Asporto non trovato.');
      if (order.status !== 'active') throw appError('ORDER_NOT_ACTIVE', 'Asporto gia chiuso.');
      if (order.sent_to_departments_at) {
        throw appError('ITEM_NOT_EDITABLE', 'Asporto gia inviato ai reparti, non modificabile.');
      }

      const body = ctx.request.body || {};
      const data = {};
      if (body.customer_name !== undefined || body.customer_phone !== undefined || body.phone !== undefined || body.customer_email !== undefined || body.email !== undefined) {
        Object.assign(data, validateTakeawayCustomer({
          customer_name: body.customer_name !== undefined ? body.customer_name : order.customer_name,
          customer_phone: body.customer_phone !== undefined ? body.customer_phone : (body.phone !== undefined ? body.phone : order.customer_phone),
          customer_email: body.customer_email !== undefined ? body.customer_email : (body.email !== undefined ? body.email : order.customer_email),
        }, { emailRequired: order.takeaway_status === 'pending_acceptance' }));
      }
      if (body.pickup_at !== undefined || body.date !== undefined || body.time !== undefined) {
        data.pickup_at = validatePickupAt({
          pickup_at: body.pickup_at !== undefined ? body.pickup_at : undefined,
          date: body.date,
          time: body.time,
        });
      }
      if (Object.keys(data).length === 0) {
        throw appError('INVALID_PAYLOAD', 'Nessun campo da aggiornare.');
      }

      let updated = await strapi.documents('api::order.order').update({
        documentId,
        data: {
          ...data,
          lock_version: (order.lock_version || 0) + 1,
        },
      });
      if (updated.takeaway_status === 'confirmed' && pickupDueForSend(updated)) {
        await sendToDepartments(strapi, updated);
        updated = await loadOrder(documentId, actor.ownerId);
      }
      const routingLookup = await loadRoutingMap(strapi, actor.owner);
      ctx.body = { data: serializeOrder(updated, true, routingLookup) };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  async acceptTakeaway(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CAMERIERE]);
      const { documentId } = ctx.params;
      const order = await loadOrder(documentId, actor.ownerId);
      if (order.service_type !== 'takeaway') throw appError('ORDER_NOT_FOUND', 'Asporto non trovato.');
      if (order.takeaway_status !== 'pending_acceptance') {
        throw appError('INVALID_PAYLOAD', 'Solo gli asporti in attesa possono essere accettati.');
      }

      await sendTakeawayEmail(strapi, {
        order,
        restaurantName: await restaurantNameForOwner(actor.ownerId),
        type: 'confirmed',
      });

      let updated = await strapi.documents('api::order.order').update({
        documentId,
        data: {
          takeaway_status: 'confirmed',
          lock_version: (order.lock_version || 0) + 1,
        },
      });
      if (pickupDueForSend(updated)) {
        await sendToDepartments(strapi, updated);
        updated = await loadOrder(documentId, actor.ownerId);
      }
      const routingLookup = await loadRoutingMap(strapi, actor.owner);
      ctx.body = { data: serializeOrder(updated, true, routingLookup) };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  async rejectTakeaway(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CAMERIERE]);
      const { documentId } = ctx.params;
      const order = await loadOrder(documentId, actor.ownerId);
      if (order.service_type !== 'takeaway') throw appError('ORDER_NOT_FOUND', 'Asporto non trovato.');
      if (order.takeaway_status !== 'pending_acceptance') {
        throw appError('INVALID_PAYLOAD', 'Solo una richiesta asporto in attesa puo essere rifiutata.');
      }
      if (order.sent_to_departments_at) {
        throw appError('INVALID_PAYLOAD', 'Asporto gia inviato ai reparti, non rifiutabile.');
      }

      await sendTakeawayEmail(strapi, {
        order,
        restaurantName: await restaurantNameForOwner(actor.ownerId),
        type: 'rejected',
      });

      await deleteOrderWithItems(order);
      ctx.status = 204;
      ctx.body = null;
    } catch (err) {
      sendError(ctx, err);
    }
  },

  async sendTakeawayToDepartments(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CAMERIERE]);
      const { documentId } = ctx.params;
      const order = await loadOrder(documentId, actor.ownerId);
      if (order.service_type !== 'takeaway') throw appError('ORDER_NOT_FOUND', 'Asporto non trovato.');
      if (order.takeaway_status !== 'confirmed') {
        throw appError('INVALID_PAYLOAD', 'Solo un asporto confermato puo essere inviato ai reparti.');
      }
      const updated = await sendToDepartments(strapi, order);
      const full = await loadOrder((updated || order).documentId, actor.ownerId);
      const routingLookup = await loadRoutingMap(strapi, actor.owner);
      ctx.body = { data: serializeOrder(full, true, routingLookup) };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  /**
   * POST /api/orders/:documentId/send
   * Invia un ordine dine-in (tavolo) in produzione: avanza in batch tutti
   * gli OrderItem con status='pending' a 'taken'. Da quel momento la
   * KitchenBoard li mostra nella colonna "Da fare" e la cucina puo'
   * iniziare a lavorarli (taken → preparing). Idempotente: se non ci sono
   * items in 'pending' ritorna l'ordine senza errori.
   */
  async sendDineInToDepartments(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CAMERIERE]);
      const { documentId } = ctx.params;
      const order = await loadOrder(documentId, actor.ownerId);
      if (order.service_type === 'takeaway') {
        throw appError('INVALID_PAYLOAD', 'Per gli asporti usare /takeaways/:id/send.');
      }
      if (order.status !== 'active') {
        throw appError('ORDER_NOT_ACTIVE', "L'ordine non e attivo.");
      }
      const items = Array.isArray(order.fk_items) ? order.fk_items : [];
      const pending = items.filter((it) => it.status === 'pending');
      if (pending.length === 0) {
        // Niente da inviare: ritorna l'ordine corrente come no-op.
        const routingLookup = await loadRoutingMap(strapi, actor.owner);
        ctx.body = { data: serializeOrder(order, true, routingLookup), meta: { sent: 0 } };
        return;
      }

      let advanced = 0;
      for (const item of pending) {
        try {
          await strapi.documents('api::order-item.order-item').update({
            documentId: item.documentId,
            data: { status: 'taken' },
          });
          advanced += 1;
        } catch (itemErr) {
          strapi.log.warn(`sendDineInToDepartments: update item ${item.documentId} fallito: ${itemErr.message}`);
        }
      }

      const full = await loadOrder(documentId, actor.ownerId);
      const routingLookup = await loadRoutingMap(strapi, actor.owner);

      // Stampa comande bulk: accoda un job per ogni stazione con item pending
      const printResult = await queueKitchenTicketBulkPrint({
        actor,
        order: full,
        items: pending,
        routingLookup,
      });

      ctx.body = {
        data: serializeOrder(full, true, routingLookup),
        meta: {
          sent: advanced,
          print_dispatched: {
            attempted: printResult.attempted,
            queued: printResult.queued,
            no_device: printResult.no_device,
          },
        },
      };
    } catch (err) {
      sendError(ctx, err);
    }
  },

  async pickupTakeaway(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Autenticazione richiesta.');

    try {
      const actor = await resolveStaffContext(strapi, user);
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CAMERIERE]);
      const { documentId } = ctx.params;
      const order = await loadOrder(documentId, actor.ownerId);
      if (order.service_type !== 'takeaway') throw appError('ORDER_NOT_FOUND', 'Asporto non trovato.');
      if (order.takeaway_status !== 'ready') {
        throw appError('INVALID_PAYLOAD', 'L\'asporto non e ancora pronto.');
      }
      const items = order.fk_items || [];
      if (!items.length || !items.every((item) => item.status === 'ready' || item.status === 'served')) {
        throw appError('INVALID_PAYLOAD', 'Tutte le portate devono essere pronte.');
      }

      const pickupTime = new Date();
      const itemsServedNow = [];
      for (const item of items) {
        if (item.status !== 'served') {
          const upd = await strapi.documents('api::order-item.order-item').update({
            documentId: item.documentId,
            data: { status: 'served', served_at: pickupTime },
          });
          itemsServedNow.push(upd);
        }
      }
      // Hook inventory: scarica gli item appena passati a served (takeaway pickup).
      // Fail-soft: errori loggati ma non rilanciati.
      for (const oi of itemsServedNow) {
        try {
          await inventoryService.applyOnServe(strapi, oi);
        } catch (invErr) {
          strapi.log.warn(`pickupTakeaway: inventory.applyOnServe fallito item ${oi.documentId}: ${invErr.message}`);
        }
      }
      const updated = await strapi.documents('api::order.order').update({
        documentId,
        data: {
          takeaway_status: 'picked_up',
          picked_up_at: new Date().toISOString(),
          lock_version: (order.lock_version || 0) + 1,
        },
      });
      const full = await loadOrder(updated.documentId, actor.ownerId);
      const routingLookup = await loadRoutingMap(strapi, actor.owner);
      ctx.body = { data: serializeOrder(full, true, routingLookup) };
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
      assertStaffRole(actor, [STAFF_ROLES.OWNER, STAFF_ROLES.GESTIONE, STAFF_ROLES.CAMERIERE]);
      const { documentId } = ctx.params;
      if (!documentId) throw appError('INVALID_PAYLOAD', 'documentId mancante.');

      const body = ctx.request.body || {};
      const paymentMethod = body.payment_method || 'simulator';

      const order = await loadOrder(documentId, actor.ownerId);

      if (order.status !== 'active') {
        throw appError('ORDER_NOT_ACTIVE', 'Ordine gia chiuso.');
      }
      if (actor.role === STAFF_ROLES.CAMERIERE && order.service_type !== 'takeaway') {
        throw appError('NOT_OWNER', 'Il cameriere puo chiudere solo ordini asporto.');
      }
      if (order.service_type === 'takeaway' && order.takeaway_status !== 'picked_up') {
        throw appError('ORDER_NOT_ACTIVE', 'Prima segnala che l\'asporto e stato preso dalla cucina.');
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
            service_type: order.service_type || 'table',
            takeaway: order.service_type === 'takeaway'
              ? {
                  customer_name: order.customer_name,
                  customer_phone: order.customer_phone,
                  pickup_at: order.pickup_at,
                }
              : null,
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
      let closedAtISO = null;

      // Chiusura atomica: solo source of truth operativa (ordine + tavolo + reservation).
      // Stats/archive vengono calcolate best-effort fuori dal percorso critico.
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

          closedAtISO = new Date().toISOString();

          await strapi.documents('api::order.order').update({
            documentId,
            data: {
              status: 'closed',
              closed_at: closedAtISO,
              total_amount: totalResult.total,
              payment_status: 'paid',
              payment_reference: paymentResult.transactionId,
              lock_version: (order.lock_version || 0) + 1,
              ...(order.service_type === 'takeaway' ? { takeaway_status: 'closed' } : {}),
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
        });
      }, { maxAttempts: 3 }).catch((err) => {
        if (err && err._resCode) throw err;
        throw appError('ORDER_CONTENTION', 'Contesa DB, riprova.');
      });

      archiveClosedOrderBestEffort({
        order,
        items,
        totalResult,
        paymentMethod,
        paymentReference: paymentResult.transactionId,
        userId: actor.ownerId,
        closedAtISO: closedAtISO || new Date().toISOString(),
      });

      ctx.body = {
        data: {
          order: {
            ...serializeOrder(order, true),
            status: 'closed',
            closed_at: closedAtISO,
            total_amount: totalResult.total,
            payment_status: 'paid',
            payment_reference: paymentResult.transactionId,
            lock_version: (order.lock_version || 0) + 1,
            ...(order.service_type === 'takeaway' ? { takeaway_status: 'closed' } : {}),
          },
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
