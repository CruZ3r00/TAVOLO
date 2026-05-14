'use strict';

/**
 * restock-order controller.
 *
 * Workflow ordinato → ricevuto per il calcolo del lead time medio.
 *
 * Endpoint (auth, gated owner-only pro dal middleware):
 *   - POST   /api/restock-orders         { items: [{ fk_ingredient, expected_qty, cost? }], note? }
 *   - GET    /api/restock-orders?status&from&to
 *   - GET    /api/restock-orders/:id
 *   - POST   /api/restock-orders/:id/receive  { received_qty, cost?, note? }
 *   - POST   /api/restock-orders/:id/cancel
 *
 * Al receive: crea InventoryMovement kind=restock, ricalcola
 * `Ingredient.reorder_lead_days` con EMA α=0.3 sui cicli storici,
 * dismissa eventuali alert per quell'ingrediente.
 */

const inventoryService = require('../../../services/inventory');
const inventoryAlerts = require('../../../services/inventory-alerts');
const { resolveStaffContext, STAFF_ROLES } = require('../../../utils/staff-access');

const ERROR_STATUS = {
  INVALID_PAYLOAD: 400,
  NOT_OWNER: 403,
  RESTOCK_NOT_FOUND: 404,
  RESTOCK_ALREADY_RECEIVED: 409,
  RESTOCK_ALREADY_CANCELLED: 409,
};

function appError(code, message) {
  const err = new Error(message || code);
  err._resCode = code;
  return err;
}

function sendError(ctx, err) {
  const code = err && err._resCode ? err._resCode : null;
  if (code && ERROR_STATUS[code]) {
    ctx.status = ERROR_STATUS[code];
    ctx.body = { error: { code, message: err.message } };
    return;
  }
  strapi.log.error('restock-order controller: errore non gestito', err);
  ctx.status = 500;
  ctx.body = { error: { code: 'INTERNAL_ERROR', message: 'Errore interno.' } };
}

function isOwnerActor(actor) {
  return actor && actor.role === STAFF_ROLES.OWNER;
}

function serializeOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    documentId: row.documentId,
    status: row.status,
    ordered_at: row.ordered_at,
    received_at: row.received_at || null,
    cancelled_at: row.cancelled_at || null,
    expected_qty: Number(row.expected_qty) || 0,
    received_qty: row.received_qty !== null && row.received_qty !== undefined ? Number(row.received_qty) : null,
    cost: row.cost !== null && row.cost !== undefined ? Number(row.cost) : null,
    note: row.note || null,
    fk_ingredient: row.fk_ingredient ? {
      id: row.fk_ingredient.id,
      documentId: row.fk_ingredient.documentId,
      name: row.fk_ingredient.name,
      unit: row.fk_ingredient.unit,
    } : null,
  };
}

/**
 * Ricalcola reorder_lead_days via EMA α=0.3 sui cicli ordered→received
 * degli ultimi 90 giorni.
 */
async function recalculateLeadTime(strapi, ingredientId) {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const cycles = await strapi.db.query('api::restock-order.restock-order').findMany({
    where: {
      fk_ingredient: { id: ingredientId },
      status: 'received',
      received_at: { $gte: since },
    },
    select: ['ordered_at', 'received_at'],
    orderBy: { received_at: 'asc' },
  });

  const days = [];
  for (const c of cycles || []) {
    if (!c.ordered_at || !c.received_at) continue;
    const a = new Date(c.ordered_at).getTime();
    const b = new Date(c.received_at).getTime();
    if (Number.isNaN(a) || Number.isNaN(b) || b < a) continue;
    days.push((b - a) / (24 * 60 * 60 * 1000));
  }
  if (days.length === 0) return null;

  // EMA α=0.3
  let ema = days[0];
  const ALPHA = 0.3;
  for (let i = 1; i < days.length; i += 1) ema = ALPHA * days[i] + (1 - ALPHA) * ema;
  return Math.max(0.5, Number(ema.toFixed(2)));
}

module.exports = {
  /**
   * POST /api/restock-orders
   * Body: { items: [{ fk_ingredient (id|documentId), expected_qty, cost? }], note? }
   * Crea N restock orders (uno per ingrediente), ognuno in stato 'ordered'.
   */
  async create(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    try {
      const actor = await resolveStaffContext(strapi, user);
      if (!isOwnerActor(actor)) throw appError('NOT_OWNER');

      const body = ctx.request.body?.data || ctx.request.body || {};
      const items = Array.isArray(body.items) ? body.items : null;
      if (!items || items.length === 0) throw appError('INVALID_PAYLOAD', 'items obbligatorio.');
      if (items.length > 100) throw appError('INVALID_PAYLOAD', 'massimo 100 item per richiesta.');

      const created = [];
      for (let i = 0; i < items.length; i += 1) {
        const it = items[i] || {};
        const expected = Number(it.expected_qty);
        if (!Number.isFinite(expected) || expected <= 0) {
          throw appError('INVALID_PAYLOAD', `Item #${i + 1}: expected_qty non valido.`);
        }
        if (!it.fk_ingredient) {
          throw appError('INVALID_PAYLOAD', `Item #${i + 1}: fk_ingredient obbligatorio.`);
        }

        // Verify ownership
        const idRaw = it.fk_ingredient;
        const isNumeric = /^\d+$/.test(String(idRaw));
        const where = { fk_user: { id: actor.ownerId } };
        if (isNumeric) where.id = Number(idRaw);
        else where.documentId = String(idRaw);
        const ing = await strapi.db.query('api::ingredient.ingredient').findOne({ where });
        if (!ing) throw appError('INVALID_PAYLOAD', `Item #${i + 1}: ingrediente non trovato.`);

        const data = {
          status: 'ordered',
          ordered_at: new Date(),
          expected_qty: expected,
          fk_user: actor.ownerId,
          fk_ingredient: ing.id,
        };
        if (it.cost !== undefined && it.cost !== null) {
          const c = Number(it.cost);
          if (Number.isFinite(c) && c >= 0) data.cost = c;
        }
        if (typeof body.note === 'string' && body.note.trim()) {
          data.note = body.note.trim().slice(0, 1000);
        } else if (typeof it.note === 'string' && it.note.trim()) {
          data.note = it.note.trim().slice(0, 1000);
        }

        const order = await strapi.documents('api::restock-order.restock-order').create({
          data,
          populate: { fk_ingredient: true },
        });
        created.push(order);
      }

      ctx.status = 201;
      ctx.body = { data: created.map(serializeOrder) };
    } catch (err) { sendError(ctx, err); }
  },

  async list(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    try {
      const actor = await resolveStaffContext(strapi, user);
      if (!isOwnerActor(actor)) throw appError('NOT_OWNER');

      const q = ctx.request.query || {};
      const where = { fk_user: { id: actor.ownerId } };
      if (q.status && ['ordered', 'received', 'cancelled'].includes(q.status)) {
        where.status = q.status;
      }
      if (q.from || q.to) {
        where.ordered_at = {};
        if (q.from) where.ordered_at.$gte = new Date(q.from);
        if (q.to) where.ordered_at.$lte = new Date(q.to);
      }

      const page = Math.max(1, parseInt(q.page, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize, 10) || 25));

      const rows = await strapi.db.query('api::restock-order.restock-order').findMany({
        where,
        populate: { fk_ingredient: true },
        orderBy: { ordered_at: 'desc' },
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      const total = await strapi.db.query('api::restock-order.restock-order').count({ where });

      ctx.body = { data: rows.map(serializeOrder), meta: { page, pageSize, total } };
    } catch (err) { sendError(ctx, err); }
  },

  async findOne(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    try {
      const actor = await resolveStaffContext(strapi, user);
      if (!isOwnerActor(actor)) throw appError('NOT_OWNER');
      const { id } = ctx.params;
      const isNumeric = /^\d+$/.test(String(id));
      const where = { fk_user: { id: actor.ownerId } };
      if (isNumeric) where.id = Number(id);
      else where.documentId = String(id);
      const row = await strapi.db.query('api::restock-order.restock-order').findOne({
        where,
        populate: { fk_ingredient: true },
      });
      if (!row) throw appError('RESTOCK_NOT_FOUND');
      ctx.body = { data: serializeOrder(row) };
    } catch (err) { sendError(ctx, err); }
  },

  /**
   * POST /api/restock-orders/:id/receive
   * Body: { received_qty, cost?, note? }
   * Crea movement restock + ricalcola reorder_lead_days + dismissa alert.
   */
  async receive(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    try {
      const actor = await resolveStaffContext(strapi, user);
      if (!isOwnerActor(actor)) throw appError('NOT_OWNER');
      const { id } = ctx.params;
      const isNumeric = /^\d+$/.test(String(id));
      const where = { fk_user: { id: actor.ownerId } };
      if (isNumeric) where.id = Number(id);
      else where.documentId = String(id);

      const row = await strapi.db.query('api::restock-order.restock-order').findOne({
        where,
        populate: { fk_ingredient: true },
      });
      if (!row) throw appError('RESTOCK_NOT_FOUND');
      if (row.status === 'received') throw appError('RESTOCK_ALREADY_RECEIVED', 'Restock gia ricevuto.');
      if (row.status === 'cancelled') throw appError('RESTOCK_ALREADY_CANCELLED', 'Restock annullato.');

      const body = ctx.request.body || {};
      const receivedQty = Number(body.received_qty);
      if (!Number.isFinite(receivedQty) || receivedQty <= 0) {
        throw appError('INVALID_PAYLOAD', 'received_qty non valido.');
      }
      const cost = body.cost !== undefined && body.cost !== null ? Number(body.cost) : null;
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : null;

      const ingredientId = row.fk_ingredient && row.fk_ingredient.id;
      if (!ingredientId) throw appError('RESTOCK_NOT_FOUND', 'Ingrediente collegato non trovato.');

      // 1) Update restock order
      const updateData = {
        status: 'received',
        received_at: new Date(),
        received_qty: receivedQty,
      };
      if (cost !== null && Number.isFinite(cost) && cost >= 0) updateData.cost = cost;
      if (note) updateData.note = note;

      const updated = await strapi.documents('api::restock-order.restock-order').update({
        documentId: row.documentId,
        data: updateData,
        populate: { fk_ingredient: true },
      });

      // 2) Apply movement on inventory
      try {
        await inventoryService.applyRestock(strapi, actor.ownerId, ingredientId, receivedQty, {
          cost: cost !== null ? cost : undefined,
          note: note || `Da restock #${row.id}`,
          fk_restock_order: row.id,
        });
      } catch (err) {
        strapi.log.warn(`restock.receive: applyRestock fallito per ${ingredientId}: ${err.message}`);
      }

      // 3) Recalc lead time
      try {
        const newLead = await recalculateLeadTime(strapi, ingredientId);
        if (newLead !== null && row.fk_ingredient && row.fk_ingredient.documentId) {
          await strapi.documents('api::ingredient.ingredient').update({
            documentId: row.fk_ingredient.documentId,
            data: { reorder_lead_days: newLead },
          });
        }
      } catch (err) {
        strapi.log.warn(`restock.receive: recalculateLeadTime fallito: ${err.message}`);
      }

      // 4) Dismiss alerts
      try {
        await inventoryAlerts.dismissForRestock(strapi, actor.ownerId, ingredientId);
      } catch (err) {
        strapi.log.warn(`restock.receive: dismissForRestock fallito: ${err.message}`);
      }

      ctx.body = { data: serializeOrder(updated) };
    } catch (err) { sendError(ctx, err); }
  },

  /**
   * POST /api/restock-orders/:id/cancel
   * Annulla un restock pending (non ricevuto). Idempotente.
   */
  async cancel(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    try {
      const actor = await resolveStaffContext(strapi, user);
      if (!isOwnerActor(actor)) throw appError('NOT_OWNER');
      const { id } = ctx.params;
      const isNumeric = /^\d+$/.test(String(id));
      const where = { fk_user: { id: actor.ownerId } };
      if (isNumeric) where.id = Number(id);
      else where.documentId = String(id);

      const row = await strapi.db.query('api::restock-order.restock-order').findOne({
        where,
        populate: { fk_ingredient: true },
      });
      if (!row) throw appError('RESTOCK_NOT_FOUND');
      if (row.status === 'received') throw appError('RESTOCK_ALREADY_RECEIVED', 'Non puoi annullare un restock gia ricevuto.');
      if (row.status === 'cancelled') {
        ctx.body = { data: serializeOrder(row) };
        return;
      }

      const updated = await strapi.documents('api::restock-order.restock-order').update({
        documentId: row.documentId,
        data: { status: 'cancelled', cancelled_at: new Date() },
        populate: { fk_ingredient: true },
      });
      ctx.body = { data: serializeOrder(updated) };
    } catch (err) { sendError(ctx, err); }
  },
};
