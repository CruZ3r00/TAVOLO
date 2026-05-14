'use strict';

/**
 * ingredient controller (legacy compat).
 *
 * Mantiene la firma originale `GET /api/ingredients` + `PUT /api/ingredients/toggle`
 * usata da `IngredientsManager.vue`. La logica e' delegata a
 * `services/ingredients` che ora opera sulla nuova entity Ingredient +
 * relazione ElementIngredient (FASE 3).
 *
 * Compatibilita output:
 *   - GET: `{ data: { ingredients: [{ key, name, count, dishes, unavailable }] } }`
 *   - PUT: `{ data: { ingredient, unavailable, unavailable_ingredients, affected_dishes } }`
 *
 * Backward compat input toggle:
 *   - Accetta sia `{ ingredient, unavailable }` (legacy) sia `{ ingredient_id, available }`
 *     (la firma alternativa documentata in CLAUDE.md).
 */

const ingredientsService = require('../../../services/ingredients');
const inventoryService = require('../../../services/inventory');
const inventoryAlerts = require('../../../services/inventory-alerts');
const { resolveStaffContext, STAFF_ROLES } = require('../../../utils/staff-access');

const ERROR_STATUS = {
  INVALID_PAYLOAD: 400,
  NOT_OWNER: 403,
  INGREDIENT_NOT_FOUND: 404,
  INGREDIENT_NAME_TAKEN: 409,
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
  strapi.log.error('ingredient controller: errore non gestito', err);
  ctx.status = 500;
  ctx.body = { error: { code: 'INTERNAL_ERROR', message: 'Errore interno.' } };
}

function isOwnerActor(actor) {
  return actor && actor.role === STAFF_ROLES.OWNER;
}

function serializeIngredient(ing) {
  if (!ing) return null;
  return {
    id: ing.id,
    documentId: ing.documentId,
    name: ing.name,
    name_normalized: ing.name_normalized,
    unit: ing.unit || 'pz',
    unit_size: ing.unit_size !== null && ing.unit_size !== undefined ? Number(ing.unit_size) : null,
    stock_qty: Number(ing.stock_qty) || 0,
    low_stock_threshold: ing.low_stock_threshold !== null && ing.low_stock_threshold !== undefined
      ? Number(ing.low_stock_threshold)
      : null,
    reorder_lead_days: Number(ing.reorder_lead_days) || 3,
    is_unavailable: ing.is_unavailable === true,
    is_active: ing.is_active !== false,
    supplier_name: ing.supplier_name || null,
    supplier_email: ing.supplier_email || null,
    notes: ing.notes || null,
    allergens: Array.isArray(ing.allergens) ? ing.allergens : [],
    createdAt: ing.createdAt,
    updatedAt: ing.updatedAt,
  };
}

module.exports = {
  /**
   * GET /api/ingredients
   */
  async list(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();

    try {
      const actor = await resolveStaffContext(strapi, user);
      const ownerId = actor ? actor.ownerId : user.id;
      const ingredients = await ingredientsService.listOwnerIngredientsAggregate(strapi, ownerId);
      return ctx.send({ data: { ingredients } });
    } catch (err) {
      strapi.log.error('ingredient.list: errore', err);
      return ctx.internalServerError('Errore caricamento ingredienti.');
    }
  },

  /**
   * PUT /api/ingredients/toggle
   * body: { ingredient: "Pomodoro", unavailable: true|false }
   *   oppure (compat): { ingredient_id, available }
   */
  async toggle(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();

    const body = ctx.request.body || {};

    // Parsing input flessibile per compat.
    let name = null;
    if (typeof body.ingredient === 'string' && body.ingredient.trim()) {
      name = body.ingredient.trim();
    }

    let unavailable;
    if (typeof body.unavailable === 'boolean') {
      unavailable = body.unavailable;
    } else if (typeof body.available === 'boolean') {
      unavailable = !body.available;
    }

    // Se non passato `ingredient` ma `ingredient_id`, risolviamo il nome.
    if (!name && body.ingredient_id) {
      try {
        const idRaw = body.ingredient_id;
        const where = /^\d+$/.test(String(idRaw))
          ? { id: Number(idRaw) }
          : { documentId: String(idRaw) };
        const found = await strapi.db.query('api::ingredient.ingredient').findOne({ where });
        if (found) name = found.name;
      } catch (_e) { /* ignore */ }
    }

    if (!name) return ctx.badRequest('Ingrediente non valido.');
    if (typeof unavailable !== 'boolean') {
      return ctx.badRequest('Flag unavailable/available richiesto (boolean).');
    }

    try {
      const actor = await resolveStaffContext(strapi, user);
      const ownerId = actor ? actor.ownerId : user.id;
      const result = await ingredientsService.setIngredientUnavailable(strapi, ownerId, name, unavailable);
      return ctx.send({
        data: {
          ingredient: name,
          unavailable,
          unavailable_ingredients: result.unavailable_ingredients,
          affected_dishes: result.affected_dishes,
        },
      });
    } catch (err) {
      strapi.log.error('ingredient.toggle: errore', err);
      return ctx.internalServerError('Errore aggiornamento ingrediente.');
    }
  },

  /* ============================================================ */
  /* ADVANCED (pro, owner-only)                                   */
  /* ============================================================ */

  /**
   * GET /api/ingredients/advanced
   * Lista completa con stock + forecast.
   */
  async listAdvanced(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();

    try {
      const actor = await resolveStaffContext(strapi, user);
      if (!isOwnerActor(actor)) throw appError('NOT_OWNER', 'Solo il titolare puo accedere al magazzino.');

      // Backfill lazy: assicura che gli Element con `ingredients` JSON legacy
      // abbiano la ricetta strutturata (Ingredient + ElementIngredient). Cosi'
      // i piatti gia esistenti compaiono in dispensa anche senza dosaggi
      // ancora impostati.
      try {
        await ingredientsService.backfillLegacyJsonIngredients(strapi, actor.ownerId);
      } catch (err) {
        strapi.log.warn(`listAdvanced: backfill fallito owner=${actor.ownerId}: ${err.message}`);
      }

      const rows = await strapi.db.query('api::ingredient.ingredient').findMany({
        where: { fk_user: { id: actor.ownerId }, is_active: true },
        orderBy: { name: 'asc' },
      });

      // Dedup difensivo per name_normalized: in caso di duplicati storici
      // mostriamo solo la riga con piu' stock (o l'id piu' basso a parita').
      const byKey = new Map();
      for (const ing of rows || []) {
        const key = String(ing.name_normalized || ing.name || '').toLowerCase();
        const existing = byKey.get(key);
        if (!existing) { byKey.set(key, ing); continue; }
        const a = Number(existing.stock_qty || 0);
        const b = Number(ing.stock_qty || 0);
        if (b > a || (b === a && ing.id < existing.id)) byKey.set(key, ing);
      }
      const deduped = [...byKey.values()];

      const out = [];
      for (const ing of deduped) {
        const base = serializeIngredient(ing);
        try {
          const f = await inventoryAlerts.computeDepletionForecast(strapi, ing);
          base.rate_per_day = f.rate_per_day;
          base.days_to_depletion = f.days_to_depletion;
          base.predicted_depletion_at = f.predicted_depletion_at;
        } catch (_e) {
          base.rate_per_day = 0;
          base.days_to_depletion = null;
          base.predicted_depletion_at = null;
        }
        out.push(base);
      }

      ctx.body = { data: out };
    } catch (err) { sendError(ctx, err); }
  },

  /**
   * POST /api/ingredients
   * Body: { name, unit?, unit_size?, low_stock_threshold?, reorder_lead_days?, supplier_*?, allergens?, notes? }
   */
  async createAdvanced(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();

    try {
      const actor = await resolveStaffContext(strapi, user);
      if (!isOwnerActor(actor)) throw appError('NOT_OWNER');

      const body = ctx.request.body?.data || ctx.request.body || {};
      const rawName = typeof body.name === 'string' ? body.name.trim() : '';
      if (!rawName) throw appError('INVALID_PAYLOAD', 'Nome obbligatorio.');

      const allowedUnits = ['g', 'kg', 'ml', 'l', 'pz', 'mazzo'];
      const unit = allowedUnits.includes(String(body.unit || '').toLowerCase())
        ? String(body.unit).toLowerCase()
        : 'pz';

      const ing = await ingredientsService.findOrCreateIngredient(strapi, actor.ownerId, rawName, {
        unit,
        allergens: Array.isArray(body.allergens) ? body.allergens.filter((x) => typeof x === 'string') : null,
      });
      if (!ing) throw appError('INVALID_PAYLOAD', 'Impossibile creare l\'ingrediente.');

      // Apply optional fields (patch)
      const patch = {};
      if (body.unit_size !== undefined) {
        const v = Number(body.unit_size);
        if (Number.isFinite(v) && v >= 0) patch.unit_size = v;
      }
      if (body.low_stock_threshold !== undefined) {
        const v = body.low_stock_threshold === null ? null : Number(body.low_stock_threshold);
        if (v === null || (Number.isFinite(v) && v >= 0)) patch.low_stock_threshold = v;
      }
      if (body.reorder_lead_days !== undefined) {
        const v = Number(body.reorder_lead_days);
        if (Number.isFinite(v) && v >= 0) patch.reorder_lead_days = v;
      }
      if (typeof body.supplier_name === 'string') patch.supplier_name = body.supplier_name.trim().slice(0, 200) || null;
      if (typeof body.supplier_email === 'string') patch.supplier_email = body.supplier_email.trim().slice(0, 200) || null;
      if (typeof body.notes === 'string') patch.notes = body.notes.trim().slice(0, 1000) || null;

      if (Object.keys(patch).length > 0) {
        await strapi.documents('api::ingredient.ingredient').update({
          documentId: ing.documentId,
          data: patch,
        });
      }

      const fresh = await strapi.db.query('api::ingredient.ingredient').findOne({ where: { id: ing.id } });
      ctx.status = 201;
      ctx.body = { data: serializeIngredient(fresh) };
    } catch (err) { sendError(ctx, err); }
  },

  /**
   * PATCH /api/ingredients/:id
   */
  async updateAdvanced(ctx) {
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

      const ing = await strapi.db.query('api::ingredient.ingredient').findOne({ where });
      if (!ing) throw appError('INGREDIENT_NOT_FOUND', 'Ingrediente non trovato.');

      const body = ctx.request.body?.data || ctx.request.body || {};
      const patch = {};
      if (typeof body.name === 'string' && body.name.trim()) {
        patch.name = body.name.trim().slice(0, 200);
        patch.name_normalized = patch.name.toLowerCase();
      }
      const allowedUnits = ['g', 'kg', 'ml', 'l', 'pz', 'mazzo'];
      if (body.unit && allowedUnits.includes(String(body.unit).toLowerCase())) {
        patch.unit = String(body.unit).toLowerCase();
      }
      if (body.unit_size !== undefined) {
        const v = body.unit_size === null ? null : Number(body.unit_size);
        if (v === null || (Number.isFinite(v) && v >= 0)) patch.unit_size = v;
      }
      if (body.low_stock_threshold !== undefined) {
        const v = body.low_stock_threshold === null ? null : Number(body.low_stock_threshold);
        if (v === null || (Number.isFinite(v) && v >= 0)) patch.low_stock_threshold = v;
      }
      if (body.reorder_lead_days !== undefined) {
        const v = Number(body.reorder_lead_days);
        if (Number.isFinite(v) && v >= 0) patch.reorder_lead_days = v;
      }
      if (typeof body.supplier_name === 'string') patch.supplier_name = body.supplier_name.trim().slice(0, 200) || null;
      if (typeof body.supplier_email === 'string') patch.supplier_email = body.supplier_email.trim().slice(0, 200) || null;
      if (typeof body.notes === 'string') patch.notes = body.notes.trim().slice(0, 1000) || null;
      if (Array.isArray(body.allergens)) patch.allergens = body.allergens.filter((x) => typeof x === 'string');
      if (typeof body.is_unavailable === 'boolean') patch.is_unavailable = body.is_unavailable;
      if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;

      if (Object.keys(patch).length === 0) throw appError('INVALID_PAYLOAD', 'Nessun campo da aggiornare.');

      await strapi.documents('api::ingredient.ingredient').update({
        documentId: ing.documentId,
        data: patch,
      });
      const fresh = await strapi.db.query('api::ingredient.ingredient').findOne({ where: { id: ing.id } });
      ctx.body = { data: serializeIngredient(fresh) };
    } catch (err) { sendError(ctx, err); }
  },

  /**
   * DELETE /api/ingredients/:id
   * Soft delete: is_active=false. Preserva InventoryMovement / ElementIngredient.
   */
  async removeAdvanced(ctx) {
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
      const ing = await strapi.db.query('api::ingredient.ingredient').findOne({ where });
      if (!ing) throw appError('INGREDIENT_NOT_FOUND');
      await strapi.documents('api::ingredient.ingredient').update({
        documentId: ing.documentId,
        data: { is_active: false },
      });
      ctx.status = 204;
      ctx.body = null;
    } catch (err) { sendError(ctx, err); }
  },

  /**
   * POST /api/ingredients/:id/restock
   * Body: { qty, cost?, note?, restock_order_id? }
   */
  async restock(ctx) {
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
      const ing = await strapi.db.query('api::ingredient.ingredient').findOne({ where });
      if (!ing) throw appError('INGREDIENT_NOT_FOUND');

      const body = ctx.request.body || {};
      const result = await inventoryService.applyRestock(strapi, actor.ownerId, ing.id, body.qty, {
        cost: body.cost,
        note: body.note,
        fk_restock_order: body.restock_order_id || null,
      });

      // Dismissione alert per quell'ingrediente
      try { await inventoryAlerts.dismissForRestock(strapi, actor.ownerId, ing.id); } catch (_e) {}

      const fresh = await strapi.db.query('api::ingredient.ingredient').findOne({ where: { id: ing.id } });
      ctx.body = { data: { ingredient: serializeIngredient(fresh), movement_id: result.movement && result.movement.id, qty_after: result.qty_after } };
    } catch (err) { sendError(ctx, err); }
  },

  /**
   * POST /api/ingredients/restock-batch
   * Body: { items: [{ ingredient_id, qty }], total_cost?, note? }
   *
   * Registra un rifornimento multi-ingrediente: applica `applyRestock` per
   * ogni item e distribuisce `total_cost` proporzionalmente alla quantita
   * (cost_i = total_cost * qty_i / sum(qty)). Cosi' il costo viene tracciato
   * a livello di movement per ingrediente, mantenendo la somma esatta.
   */
  async restockBatch(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    try {
      const actor = await resolveStaffContext(strapi, user);
      if (!isOwnerActor(actor)) throw appError('NOT_OWNER');

      const body = ctx.request.body?.data || ctx.request.body || {};
      const items = Array.isArray(body.items) ? body.items : null;
      if (!items || items.length === 0) throw appError('INVALID_PAYLOAD', 'items obbligatorio.');
      if (items.length > 100) throw appError('INVALID_PAYLOAD', 'massimo 100 item per richiesta.');

      // Pre-valida ogni item + verifica ownership.
      const validated = [];
      let totalQty = 0;
      for (let i = 0; i < items.length; i += 1) {
        const it = items[i] || {};
        const qty = Number(it.qty);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw appError('INVALID_PAYLOAD', `Item #${i + 1}: qty non valida.`);
        }
        const idRaw = it.ingredient_id;
        if (!idRaw) throw appError('INVALID_PAYLOAD', `Item #${i + 1}: ingredient_id obbligatorio.`);
        const isNumeric = /^\d+$/.test(String(idRaw));
        const where = { fk_user: { id: actor.ownerId } };
        if (isNumeric) where.id = Number(idRaw);
        else where.documentId = String(idRaw);
        const ing = await strapi.db.query('api::ingredient.ingredient').findOne({ where });
        if (!ing) throw appError('INVALID_PAYLOAD', `Item #${i + 1}: ingrediente non trovato.`);
        validated.push({ ingredient: ing, qty });
        totalQty += qty;
      }

      const totalCostRaw = body.total_cost !== undefined && body.total_cost !== null ? Number(body.total_cost) : null;
      const totalCost = Number.isFinite(totalCostRaw) && totalCostRaw >= 0 ? totalCostRaw : null;
      const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 1000) : null;

      const results = [];
      for (const { ingredient, qty } of validated) {
        const perItemCost = totalCost !== null && totalQty > 0
          ? Number((totalCost * qty / totalQty).toFixed(2))
          : undefined;
        const res = await inventoryService.applyRestock(strapi, actor.ownerId, ingredient.id, qty, {
          cost: perItemCost,
          note,
        });
        try { await inventoryAlerts.dismissForRestock(strapi, actor.ownerId, ingredient.id); } catch (_e) {}
        results.push({
          ingredient_id: ingredient.id,
          ingredient_documentId: ingredient.documentId,
          name: ingredient.name,
          qty_added: qty,
          cost: perItemCost !== undefined ? perItemCost : null,
          qty_after: res.qty_after,
        });
      }

      ctx.status = 201;
      ctx.body = { data: { items: results, total_cost: totalCost } };
    } catch (err) { sendError(ctx, err); }
  },

  /**
   * POST /api/ingredients/:id/waste
   * Body: { qty, reason, note? }
   */
  async waste(ctx) {
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
      const ing = await strapi.db.query('api::ingredient.ingredient').findOne({ where });
      if (!ing) throw appError('INGREDIENT_NOT_FOUND');

      const body = ctx.request.body || {};
      const allowedReasons = ['expired', 'broken', 'order_voided', 'other'];
      const reason = allowedReasons.includes(String(body.reason || '')) ? body.reason : 'other';

      const result = await inventoryService.applyWaste(strapi, actor.ownerId, ing.id, body.qty, reason, body.note);
      const fresh = await strapi.db.query('api::ingredient.ingredient').findOne({ where: { id: ing.id } });
      ctx.body = { data: { ingredient: serializeIngredient(fresh), movement_id: result.movement && result.movement.id, qty_after: result.qty_after } };
    } catch (err) { sendError(ctx, err); }
  },

  /**
   * POST /api/ingredients/:id/confirm-depleted
   * Body: { residual_qty? } — null/undefined = "terminato definitivamente" (residual=0)
   * Ricalcola le qty_per_serving via auto-tuning.
   */
  async confirmDepleted(ctx) {
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
      const ing = await strapi.db.query('api::ingredient.ingredient').findOne({ where });
      if (!ing) throw appError('INGREDIENT_NOT_FOUND');

      const body = ctx.request.body || {};
      const residual = body.residual_qty !== undefined && body.residual_qty !== null
        ? Number(body.residual_qty)
        : 0;
      if (!Number.isFinite(residual) || residual < 0) {
        throw appError('INVALID_PAYLOAD', 'residual_qty non valido.');
      }

      const out = await inventoryService.recalcUsageAverages(strapi, ing.id, residual);
      const fresh = await strapi.db.query('api::ingredient.ingredient').findOne({ where: { id: ing.id } });
      ctx.body = { data: { ingredient: serializeIngredient(fresh), recalc: out } };
    } catch (err) { sendError(ctx, err); }
  },

  /**
   * GET /api/ingredients/:id/movements?limit=&from=&to=
   * Lista movements append-only per audit.
   */
  async listMovements(ctx) {
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
      const ing = await strapi.db.query('api::ingredient.ingredient').findOne({ where });
      if (!ing) throw appError('INGREDIENT_NOT_FOUND');

      const q = ctx.request.query || {};
      const limit = Math.min(200, Math.max(1, parseInt(q.limit, 10) || 50));
      const mvWhere = { fk_ingredient: { id: ing.id } };
      if (q.from || q.to) {
        mvWhere.createdAt = {};
        if (q.from) mvWhere.createdAt.$gte = new Date(q.from);
        if (q.to) mvWhere.createdAt.$lte = new Date(q.to);
      }

      const rows = await strapi.db.query('api::inventory-movement.inventory-movement').findMany({
        where: mvWhere,
        orderBy: { createdAt: 'desc' },
        limit,
      });
      ctx.body = { data: rows.map((m) => ({
        id: m.id,
        documentId: m.documentId,
        kind: m.kind,
        qty_delta: Number(m.qty_delta),
        qty_after: Number(m.qty_after),
        cost: m.cost !== null ? Number(m.cost) : null,
        reason: m.reason || null,
        note: m.note || null,
        createdAt: m.createdAt,
      })) };
    } catch (err) { sendError(ctx, err); }
  },
};
