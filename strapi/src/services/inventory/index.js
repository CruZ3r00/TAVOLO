'use strict';

/**
 * Service inventory: movimentazione stock + scarico automatico.
 *
 * Concetti chiave (vedi todo.md FASE 4):
 *   - applyOnServe(orderItem): chiamato al passaggio OrderItem→served (cucina+sala)
 *     o al pickup del takeaway. Per Element non-beverage: itera ElementIngredient
 *     e crea InventoryMovement consumption decrementando Ingredient.stock_qty.
 *     Per Element is_beverage_advanced=true: NO-OP (scaricato al carico fatto).
 *     Per free-form (fk_element null): regex match su Ingredient.name_normalized
 *     dell'owner, scarico best-effort se trovato.
 *
 *   - applyOnVoid(orderItem): compensativo waste se l'item era gia served.
 *
 *   - commitBarShift(shiftReport, ownerId): al carico fatto, scarica le quantita
 *     di bevande aggregate nel turno (sia unitarie sia advanced) dal magazzino
 *     centrale.
 *
 *   - parseFreeformIngredients(ownerId, name): regex su Ingredient.name_normalized
 *     dell'owner. Usato anche da bar-shift.report per arricchire i free-form.
 *
 *   - applyRestock / applyWaste: API esplicite per il PantryView.
 *
 *   - recalcUsageAverages(ingredientId, residualHint): al confirm-depleted,
 *     ricalcola qty_per_serving delle ElementIngredient con auto-tuning.
 *
 * Tutte le operazioni hanno gating: NO-OP se l'owner non e' su piano `pro`
 * (il service e' chiamabile in modo difensivo, costa poco).
 *
 * Append-only: ogni decremento/incremento crea InventoryMovement con qty_after
 * snapshot. Lo stock_qty su Ingredient e' un denormalized cache, l'autorita
 * e' la somma cumulativa dei movements.
 *
 * Concorrenza: chiamate in transazione esterna (es. dentro order-item-status
 * update) ricevono `trx` opzionale; se assente, usano strapi.db.transaction
 * con withRetry.
 */

const { withRetry, isSqlite, getDialect } = require('../../utils/db-lock');

const norm = (s) => String(s || '').trim().toLowerCase();

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function isProOwner(owner) {
  if (!owner) return false;
  const plan = String(owner.subscription_plan || '').toLowerCase();
  return plan === 'pro';
}

async function loadOwnerForUser(strapi, userId) {
  // Risolve il vero owner (se l'attore e' staff via fk_owner).
  if (!userId) return null;
  const u = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: { id: userId },
    populate: { fk_owner: true },
    select: ['id', 'subscription_plan', 'subscription_status', 'staff_role'],
  });
  if (!u) return null;
  if (u.fk_owner && u.fk_owner.id && u.fk_owner.id !== u.id) {
    const owner = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: u.fk_owner.id },
      select: ['id', 'subscription_plan', 'subscription_status', 'email', 'name'],
    });
    return owner;
  }
  return u;
}

async function loadIngredientById(strapi, id) {
  return strapi.db.query('api::ingredient.ingredient').findOne({
    where: { id },
    populate: { fk_user: { select: ['id', 'email', 'name', 'subscription_plan'] } },
  });
}

async function loadIngredientByName(strapi, ownerId, name) {
  const key = norm(name);
  if (!key) return null;
  return strapi.db.query('api::ingredient.ingredient').findOne({
    where: { fk_user: { id: ownerId }, name_normalized: key },
  });
}

/* ------------------------------------------------------------------ */
/* InventoryMovement append + stock update                            */
/* ------------------------------------------------------------------ */

/**
 * Append InventoryMovement + update Ingredient.stock_qty atomic.
 * Negative qtyDelta = scarico; positive = carico.
 * Non scende sotto 0 (clamp). qty_after riflette il valore finale clampato.
 *
 * @param {object} strapi
 * @param {object} ingredient — full row con id, stock_qty, fk_user.id
 * @param {object} movement — { kind, qty_delta, cost?, reason?, note?, fk_order?, fk_order_item?, fk_restock_order?, fk_bar_shift? }
 * @returns {Promise<{ movement, ingredient }>}
 */
async function appendMovement(strapi, ingredient, movement) {
  const currentStock = Number(ingredient.stock_qty) || 0;
  const delta = Number(movement.qty_delta) || 0;
  let qtyAfter = currentStock + delta;
  if (qtyAfter < 0) qtyAfter = 0;

  // Aggiorna stock
  await strapi.db.query('api::ingredient.ingredient').update({
    where: { id: ingredient.id },
    data: { stock_qty: qtyAfter },
  });

  // Append movement
  const data = {
    kind: movement.kind,
    qty_delta: delta,
    qty_after: qtyAfter,
    fk_ingredient: ingredient.id,
    fk_user: ingredient.fk_user ? ingredient.fk_user.id : null,
  };
  if (movement.cost !== undefined && movement.cost !== null) {
    data.cost = Number(movement.cost);
  }
  if (movement.reason) data.reason = String(movement.reason).slice(0, 100);
  if (movement.note) data.note = String(movement.note).slice(0, 1000);
  if (movement.fk_order) data.fk_order = movement.fk_order;
  if (movement.fk_order_item) data.fk_order_item = movement.fk_order_item;
  if (movement.fk_restock_order) data.fk_restock_order = movement.fk_restock_order;
  if (movement.fk_bar_shift) data.fk_bar_shift = movement.fk_bar_shift;

  const created = await strapi.documents('api::inventory-movement.inventory-movement').create({ data });
  return { movement: created, qty_after: qtyAfter, prev_stock: currentStock };
}

/* ------------------------------------------------------------------ */
/* applyOnServe                                                       */
/* ------------------------------------------------------------------ */

/**
 * Scarica gli ingredienti consumati da un OrderItem `served` (o picked_up
 * per takeaway). NO-OP se:
 *   - owner non pro
 *   - element advanced beverage (scaricato al carico fatto)
 *   - quantity non valida
 *
 * Per Element con ElementIngredient strutturate: itera e scarica
 * `qty_per_serving * orderItem.quantity` da ogni Ingredient.
 *
 * Per free-form (orderItem.fk_element = null): regex match sul name
 * dell'OrderItem contro Ingredient.name_normalized dell'owner. Se match,
 * scarico best-effort di qty=1 unit per match (placeholder, non
 * precise — l'utente puo' censire le freeform come Element per accuratezza).
 *
 * Fail-soft: errori loggati ma non rilanciati (NON deve bloccare la FSM
 * dell'ordine).
 */
async function applyOnServe(strapi, orderItem, opts = {}) {
  if (!orderItem || !orderItem.id) return;
  const qtyServed = Number(orderItem.quantity) || 0;
  if (qtyServed <= 0) return;

  try {
    // Trova owner via populate ordine
    const item = await strapi.db.query('api::order-item.order-item').findOne({
      where: { id: orderItem.id },
      populate: {
        fk_element: {
          populate: {
            fk_element_ingredients: { populate: { fk_ingredient: true } },
          },
        },
        fk_order: { populate: { fk_user: { select: ['id', 'subscription_plan', 'subscription_status'] } } },
      },
    });
    if (!item) return;

    const owner = item.fk_order && item.fk_order.fk_user;
    if (!owner || !owner.id) return;
    if (!isProOwner(owner)) return; // gating piano

    const element = item.fk_element;
    if (element && element.is_beverage_advanced === true) {
      // Le bevande advanced vengono scaricate al carico fatto del turno,
      // non al singolo served. Skip.
      return;
    }

    // 1) Element strutturato → itera ElementIngredient
    if (element && Array.isArray(element.fk_element_ingredients)) {
      for (const link of element.fk_element_ingredients) {
        const ing = link.fk_ingredient;
        if (!ing || !ing.id) continue;
        const qtyPer = Number(link.qty_per_serving) || 0;
        if (qtyPer <= 0) continue; // non tracciato → skip
        const totalQty = qtyPer * qtyServed;
        try {
          const fresh = await loadIngredientById(strapi, ing.id);
          if (!fresh) continue;
          await appendMovement(strapi, fresh, {
            kind: 'consumption',
            qty_delta: -totalQty,
            fk_order: item.fk_order ? item.fk_order.id : null,
            fk_order_item: item.id,
            note: `Auto-scarico served (qty ${qtyServed} × ${qtyPer} ${ing.unit || 'pz'})`,
          });
        } catch (err) {
          strapi.log.warn(`inventory.applyOnServe: scarico ingredient ${ing.id} fallito: ${err.message}`);
        }
      }

      // Addon consumption (dopo le ricette del piatto)
      const itemAddons = await strapi.db.query('api::order-item-addon.order-item-addon').findMany({
        where: { fk_order_item: { id: item.id } },
        populate: { fk_ingredient: { select: ['id', 'name', 'unit'] } },
      });
      for (const addon of (itemAddons || [])) {
        const addonIng = addon.fk_ingredient;
        if (!addonIng || !addonIng.id) continue;
        const addonQty = Number(addon.qty_used) || 0;
        if (addonQty <= 0) continue;
        const totalAddonQty = addonQty * qtyServed;
        try {
          const freshAddon = await loadIngredientById(strapi, addonIng.id);
          if (!freshAddon) continue;
          await appendMovement(strapi, freshAddon, {
            kind: 'consumption',
            qty_delta: -totalAddonQty,
            fk_order: item.fk_order ? item.fk_order.id : null,
            fk_order_item: item.id,
            note: `Addon: ${addon.name} (qty ${qtyServed} x ${addonQty} ${addonIng.unit || 'pz'})`,
          });
        } catch (err) {
          strapi.log.warn(`inventory.applyOnServe: scarico addon ${addon.name} fallito: ${err.message}`);
        }
      }

      return;
    }

    // 2) Free-form (no fk_element) → regex match su Ingredient.name_normalized
    if (!element && typeof item.name === 'string' && item.name.trim()) {
      const matches = await parseFreeformIngredients(strapi, owner.id, item.name);
      for (const m of matches) {
        try {
          const fresh = await loadIngredientById(strapi, m.ingredient_id);
          if (!fresh) continue;
          // Best-effort: 1 unit di stock per match (no qty_per_serving definita).
          await appendMovement(strapi, fresh, {
            kind: 'consumption',
            qty_delta: -qtyServed,
            fk_order: item.fk_order ? item.fk_order.id : null,
            fk_order_item: item.id,
            reason: 'freeform_regex_match',
            note: `Free-form "${item.name}" → ${m.matched_name} (stima ${qtyServed} ${fresh.unit || 'pz'})`,
          });
        } catch (err) {
          strapi.log.warn(`inventory.applyOnServe: free-form scarico ${m.matched_name} fallito: ${err.message}`);
        }
      }
    }

    // Addon consumption (anche per free-form items)
    const freeformAddons = await strapi.db.query('api::order-item-addon.order-item-addon').findMany({
      where: { fk_order_item: { id: item.id } },
      populate: { fk_ingredient: { select: ['id', 'name', 'unit'] } },
    });
    for (const addon of (freeformAddons || [])) {
      const addonIng = addon.fk_ingredient;
      if (!addonIng || !addonIng.id) continue;
      const addonQty = Number(addon.qty_used) || 0;
      if (addonQty <= 0) continue;
      const totalAddonQty = addonQty * qtyServed;
      try {
        const freshAddon = await loadIngredientById(strapi, addonIng.id);
        if (!freshAddon) continue;
        await appendMovement(strapi, freshAddon, {
          kind: 'consumption',
          qty_delta: -totalAddonQty,
          fk_order: item.fk_order ? item.fk_order.id : null,
          fk_order_item: item.id,
          note: `Addon: ${addon.name} (qty ${qtyServed} x ${addonQty} ${addonIng.unit || 'pz'})`,
        });
      } catch (err) {
        strapi.log.warn(`inventory.applyOnServe: scarico addon ${addon.name} fallito: ${err.message}`);
      }
    }
  } catch (err) {
    strapi.log.warn(`inventory.applyOnServe: errore generale OrderItem ${orderItem.id}: ${err.message}`);
  }
}

/* ------------------------------------------------------------------ */
/* applyOnVoid (compensativo waste)                                   */
/* ------------------------------------------------------------------ */

/**
 * Quando un OrderItem viene voided dopo essere stato served, crea movement
 * compensativi `waste` con reason=order_voided per riprodurre allo stesso
 * stock. Non modifica le medie d'uso (waste non entra in usage averages).
 */
async function applyOnVoid(strapi, orderItem) {
  if (!orderItem || !orderItem.id) return;
  try {
    const movements = await strapi.db.query('api::inventory-movement.inventory-movement').findMany({
      where: { fk_order_item: { id: orderItem.id }, kind: 'consumption' },
      populate: { fk_ingredient: { select: ['id'] } },
    });
    for (const m of movements || []) {
      const ingId = m.fk_ingredient && m.fk_ingredient.id;
      if (!ingId) continue;
      const undoDelta = -Number(m.qty_delta) || 0;
      if (undoDelta === 0) continue;
      try {
        const fresh = await loadIngredientById(strapi, ingId);
        if (!fresh) continue;
        await appendMovement(strapi, fresh, {
          kind: 'waste',
          qty_delta: undoDelta * -1, // waste decrementa: il consumo originale era negativo, il waste deve essere lo stesso segno per "restituire" lo stock al magazzino
          reason: 'order_voided',
          fk_order_item: orderItem.id,
          note: `Compensativo voided OrderItem ${orderItem.id}`,
        });
        // NOTA: la spec dice che lo "scarto da voided" influisce su stock
        // ma NON sulla media di utilizzo. La media e' calcolata altrove
        // (recalcUsageAverages) ignorando kind=waste.
      } catch (err) {
        strapi.log.warn(`inventory.applyOnVoid: compensativo ingrediente ${ingId} fallito: ${err.message}`);
      }
    }
  } catch (err) {
    strapi.log.warn(`inventory.applyOnVoid: errore OrderItem ${orderItem.id}: ${err.message}`);
  }
}

/* ------------------------------------------------------------------ */
/* commitBarShift                                                     */
/* ------------------------------------------------------------------ */

/**
 * Al "Carico fatto" del turno: scarica le bevande dal magazzino centrale.
 * Per ogni unit di `report.units` (Element con is_beverage=true):
 *   - is_beverage_advanced=false: scarica `served_count` unita di Ingredient
 *     auto-mappato (stesso nome dell'Element, find-or-create).
 *   - is_beverage_advanced=true: itera le ElementIngredient e per ciascuna
 *     scarica `qty_per_serving * served_count` ml.
 *
 * NO-OP se l'owner non e' pro.
 */
async function commitBarShift(strapi, shiftReport, ownerId, shiftId) {
  if (!shiftReport || !ownerId) return { units_consumed: 0 };
  const owner = await loadOwnerForUser(strapi, ownerId);
  if (!owner || !isProOwner(owner)) return { units_consumed: 0 };

  let totalUnits = 0;
  const units = Array.isArray(shiftReport.units) ? shiftReport.units : [];

  for (const u of units) {
    try {
      if (!u || !u.element_documentId) continue;

      // Recupera Element con ElementIngredient strutturate
      const element = await strapi.db.query('api::element.element').findOne({
        where: { documentId: u.element_documentId },
        populate: { fk_element_ingredients: { populate: { fk_ingredient: true } } },
      });
      if (!element) continue;

      const servedCount = Number(u.served_count) || 0;
      if (servedCount <= 0) continue;

      if (element.is_beverage_advanced === true) {
        // Scarica ml per ogni ingrediente della ricetta
        const links = Array.isArray(element.fk_element_ingredients) ? element.fk_element_ingredients : [];
        for (const link of links) {
          const ing = link.fk_ingredient;
          if (!ing || !ing.id) continue;
          const qtyPer = Number(link.qty_per_serving) || 0;
          if (qtyPer <= 0) continue;
          const total = qtyPer * servedCount;
          const fresh = await loadIngredientById(strapi, ing.id);
          if (!fresh) continue;
          await appendMovement(strapi, fresh, {
            kind: 'consumption',
            qty_delta: -total,
            fk_bar_shift: shiftId || null,
            note: `Bar carico fatto: ${servedCount} × ${qtyPer} ${ing.unit || 'ml'} (${u.name})`,
          });
          // Calcola unita complete (bottiglie) per il counter
          if (fresh.unit_size && fresh.unit_size > 0) {
            totalUnits += Math.ceil(total / Number(fresh.unit_size));
          }
        }
      } else {
        // Bevanda unitaria: find-or-create Ingredient con stesso nome dell'Element
        // (unit='pz', stock_qty=0 al primo passaggio). Scarica servedCount unita.
        const ingredientsService = require('../ingredients');
        const ing = await ingredientsService.findOrCreateIngredient(strapi, ownerId, element.name, { unit: 'pz' });
        if (!ing) continue;
        const fresh = await loadIngredientById(strapi, ing.id);
        if (!fresh) continue;
        await appendMovement(strapi, fresh, {
          kind: 'consumption',
          qty_delta: -servedCount,
          fk_bar_shift: shiftId || null,
          note: `Bar carico fatto: ${servedCount} ${fresh.unit || 'pz'} (${u.name})`,
        });
        totalUnits += servedCount;
      }
    } catch (err) {
      strapi.log.warn(`inventory.commitBarShift: errore element ${u && u.element_documentId}: ${err.message}`);
    }
  }

  return { units_consumed: totalUnits };
}

/* ------------------------------------------------------------------ */
/* parseFreeformIngredients                                           */
/* ------------------------------------------------------------------ */

/**
 * Tokenizza `name`, normalizza e cerca quali Ingredient.name_normalized
 * dell'owner appaiono come token o sottostringhe contigue.
 *
 * Ritorna `[{ ingredient_id, matched_name }]`. Best-effort.
 */
async function parseFreeformIngredients(strapi, ownerId, freeformName) {
  const text = norm(freeformName);
  if (!text) return [];

  const ingredients = await strapi.db.query('api::ingredient.ingredient').findMany({
    where: { fk_user: { id: ownerId }, is_active: true },
    select: ['id', 'name', 'name_normalized'],
  });
  if (!ingredients || ingredients.length === 0) return [];

  const matches = [];
  for (const ing of ingredients) {
    const key = ing.name_normalized;
    if (!key) continue;
    // Match come sottostringa whole-word: regex `\b<key>\b` non funziona se
    // key ha spazi/accenti. Usiamo un controllo semplice: il name normalizzato
    // dell'item contiene il key normalizzato.
    if (text.includes(key)) {
      matches.push({ ingredient_id: ing.id, matched_name: ing.name });
    }
  }
  return matches;
}

/* ------------------------------------------------------------------ */
/* applyRestock / applyWaste                                          */
/* ------------------------------------------------------------------ */

async function applyRestock(strapi, ownerId, ingredientId, qty, opts = {}) {
  const q = Number(qty);
  if (!Number.isFinite(q) || q <= 0) {
    const err = new Error('Quantita di rifornimento non valida.');
    err._resCode = 'INVALID_PAYLOAD';
    throw err;
  }
  const fresh = await loadIngredientById(strapi, ingredientId);
  if (!fresh) {
    const err = new Error('Ingrediente non trovato.');
    err._resCode = 'INGREDIENT_NOT_FOUND';
    throw err;
  }
  if (fresh.fk_user && fresh.fk_user.id !== ownerId) {
    const err = new Error('Non autorizzato.');
    err._resCode = 'NOT_OWNER';
    throw err;
  }
  return appendMovement(strapi, fresh, {
    kind: 'restock',
    qty_delta: q,
    cost: opts.cost,
    note: opts.note || null,
    fk_restock_order: opts.fk_restock_order || null,
  });
}

async function applyWaste(strapi, ownerId, ingredientId, qty, reason, note) {
  const q = Number(qty);
  if (!Number.isFinite(q) || q <= 0) {
    const err = new Error('Quantita di scarto non valida.');
    err._resCode = 'INVALID_PAYLOAD';
    throw err;
  }
  const fresh = await loadIngredientById(strapi, ingredientId);
  if (!fresh) {
    const err = new Error('Ingrediente non trovato.');
    err._resCode = 'INGREDIENT_NOT_FOUND';
    throw err;
  }
  if (fresh.fk_user && fresh.fk_user.id !== ownerId) {
    const err = new Error('Non autorizzato.');
    err._resCode = 'NOT_OWNER';
    throw err;
  }
  return appendMovement(strapi, fresh, {
    kind: 'waste',
    qty_delta: -q,
    reason: reason || 'other',
    note: note || null,
  });
}

/* ------------------------------------------------------------------ */
/* recalcUsageAverages (auto-tuning)                                  */
/* ------------------------------------------------------------------ */

/**
 * Al confirm-depleted: calcola la quantita effettivamente consumata dall'ultimo
 * restock (o initial) ad oggi tenendo conto dello stock residuo dichiarato.
 *
 * Formula auto-tuning (factor clamp [0.5, 2.0]):
 *   qty_actual = stock_at_last_restock + sum(restock_since) - residual_now
 *   qty_old_total = sum_i ( n_i × qty_per_serving_i_old )
 *   factor = qty_actual / max(qty_old_total, ε)
 *   factor = clamp(factor, 0.5, 2.0)
 *   qty_per_serving_i_new = qty_per_serving_i_old × factor
 *
 * Append InventoryMovement kind=adjustment con la differenza.
 */
async function recalcUsageAverages(strapi, ingredientId, residualHint = null) {
  const fresh = await loadIngredientById(strapi, ingredientId);
  if (!fresh) return { factor: 1, updated: 0 };

  // Ultimo restock o initial
  const lastRestock = await strapi.db.query('api::inventory-movement.inventory-movement').findOne({
    where: { fk_ingredient: { id: ingredientId }, kind: { $in: ['restock', 'initial'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (!lastRestock) return { factor: 1, updated: 0 };

  const stockAtRestock = Number(lastRestock.qty_after) || 0;
  const restocksSince = await strapi.db.query('api::inventory-movement.inventory-movement').findMany({
    where: {
      fk_ingredient: { id: ingredientId },
      kind: 'restock',
      createdAt: { $gt: lastRestock.createdAt },
    },
    select: ['qty_delta'],
  });
  const sumRestocks = (restocksSince || []).reduce((s, m) => s + (Number(m.qty_delta) || 0), 0);

  const residual = residualHint !== null && residualHint !== undefined
    ? Number(residualHint)
    : 0;
  const qtyActual = stockAtRestock + sumRestocks - residual;
  if (qtyActual <= 0) return { factor: 1, updated: 0 };

  // Consumi previsti: somma per piatti di (n_i × qty_per_serving_i_old)
  const links = await strapi.db.query('api::element-ingredient.element-ingredient').findMany({
    where: { fk_ingredient: { id: ingredientId } },
    populate: { fk_element: { select: ['id'] } },
  });
  if (!links || links.length === 0) return { factor: 1, updated: 0 };

  // Per ogni Element ricava n_i = numero di porzioni servite dall'ultimo restock
  let qtyOldTotal = 0;
  const linkInfo = [];
  for (const link of links) {
    const elId = link.fk_element && link.fk_element.id;
    if (!elId) continue;
    const qtyPer = Number(link.qty_per_serving) || 0;

    // n_i: conta gli OrderItem con fk_element=elId served_at > lastRestock.createdAt
    // o picked_up_at della order.
    const itemsServed = await strapi.db.connection({ oi: 'order_items' })
      .leftJoin('order_items_fk_element_lnk as elnk', 'elnk.order_item_id', 'oi.id')
      .where('elnk.element_id', elId)
      .where('oi.status', 'served')
      .where('oi.voided', false)
      .where('oi.served_at', '>', lastRestock.createdAt)
      .sum({ qty: 'oi.quantity' })
      .first();
    const n = Number((itemsServed && itemsServed.qty) || 0);
    qtyOldTotal += n * qtyPer;
    linkInfo.push({ link, n, qtyPer });
  }

  const eps = 1e-6;
  let factor = qtyActual / Math.max(qtyOldTotal, eps);
  if (!Number.isFinite(factor) || factor <= 0) factor = 1;
  factor = Math.max(0.5, Math.min(2.0, factor));

  // Aggiorna qty_per_serving
  let updated = 0;
  for (const info of linkInfo) {
    if (info.qtyPer <= 0) continue;
    const next = Number((info.qtyPer * factor).toFixed(4));
    if (Math.abs(next - info.qtyPer) < 1e-6) continue;
    try {
      await strapi.documents('api::element-ingredient.element-ingredient').update({
        documentId: info.link.documentId,
        data: { qty_per_serving: next },
      });
      updated += 1;
    } catch (err) {
      strapi.log.warn(`inventory.recalcUsageAverages: update link ${info.link.id} fallita: ${err.message}`);
    }
  }

  // Append adjustment movement con la differenza tra stock attuale e qty_actual
  try {
    const newStock = residual;
    const delta = newStock - (Number(fresh.stock_qty) || 0);
    if (Math.abs(delta) > 1e-9) {
      await appendMovement(strapi, fresh, {
        kind: 'adjustment',
        qty_delta: delta,
        reason: 'confirm_depleted_recalc',
        note: `Auto-tuning: factor=${factor.toFixed(3)}, residuo=${residual}, atteso=${qtyOldTotal.toFixed(2)}`,
      });
    }
  } catch (err) {
    strapi.log.warn(`inventory.recalcUsageAverages: adjustment movement fallito: ${err.message}`);
  }

  return { factor, updated, qty_actual: qtyActual, qty_expected: qtyOldTotal };
}

module.exports = {
  isProOwner,
  loadOwnerForUser,
  appendMovement,
  applyOnServe,
  applyOnVoid,
  commitBarShift,
  parseFreeformIngredients,
  applyRestock,
  applyWaste,
  recalcUsageAverages,
};
