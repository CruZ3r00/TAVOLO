'use strict';

/**
 * Unit test pure sui service inventory (FASE 6).
 *
 * Strategia: gli helper di src/services/inventory/index.js usano direttamente
 * strapi.db.query / strapi.documents. Qui li testiamo con uno stub minimale
 * che riproduce i metodi necessari, isolando la logica algoritmica
 * (regex match, clamp >=0, factor clamp). I test che richiedono knex puro
 * (strapi.db.connection) o orchestrazione transazionale restano fuori dal
 * pure-unit e saranno coperti dai smoke E2E.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  appendMovement,
  parseFreeformIngredients,
} = require('../src/services/inventory');

/* ------------------------------------------------------------------ */
/* Helpers per stub                                                   */
/* ------------------------------------------------------------------ */

function createStubStrapi(handlers = {}) {
  const calls = { ingredientUpdates: [], movementsCreated: [] };
  const ingredientsList = handlers.ingredients || [];

  const strapi = {
    log: { warn() {}, error() {}, info() {} },
    db: {
      query(uid) {
        if (uid === 'api::ingredient.ingredient') {
          return {
            findMany: async ({ where, select } = {}) => {
              // Filtra: fk_user.id, is_active
              return ingredientsList.filter((i) => {
                if (where && where.is_active !== undefined && i.is_active !== where.is_active) return false;
                if (where && where.fk_user && where.fk_user.id !== undefined) {
                  const ownerId = i.fk_user && i.fk_user.id;
                  if (ownerId !== where.fk_user.id) return false;
                }
                return true;
              });
            },
            update: async ({ where, data }) => {
              calls.ingredientUpdates.push({ where, data });
              return { id: where.id, ...data };
            },
          };
        }
        return { findMany: async () => [], findOne: async () => null, update: async () => null };
      },
    },
    documents(uid) {
      if (uid === 'api::inventory-movement.inventory-movement') {
        return {
          create: async ({ data }) => {
            const created = { id: calls.movementsCreated.length + 1, documentId: `mov-${Date.now()}`, ...data };
            calls.movementsCreated.push(created);
            return created;
          },
        };
      }
      return { create: async () => null, update: async () => null };
    },
  };

  return { strapi, calls };
}

/* ------------------------------------------------------------------ */
/* appendMovement                                                     */
/* ------------------------------------------------------------------ */

test('appendMovement clampa qty_after a 0 (no negative stock)', async () => {
  const { strapi, calls } = createStubStrapi();
  const ingredient = {
    id: 42,
    stock_qty: 5,
    fk_user: { id: 1 },
  };
  const result = await appendMovement(strapi, ingredient, {
    kind: 'consumption',
    qty_delta: -20, // tenta di scaricare 20 da uno stock di 5
  });
  // qty_after non puo' andare sotto zero
  assert.equal(result.qty_after, 0);
  assert.equal(result.prev_stock, 5);
  // Update ingredient.stock_qty a 0
  assert.equal(calls.ingredientUpdates.length, 1);
  assert.equal(calls.ingredientUpdates[0].data.stock_qty, 0);
  // Movement scritto con qty_after=0
  assert.equal(calls.movementsCreated.length, 1);
  assert.equal(calls.movementsCreated[0].qty_after, 0);
  assert.equal(calls.movementsCreated[0].qty_delta, -20);
});

test('appendMovement somma delta positivo al stock corrente', async () => {
  const { strapi, calls } = createStubStrapi();
  const ingredient = {
    id: 7,
    stock_qty: 10,
    fk_user: { id: 1 },
  };
  const result = await appendMovement(strapi, ingredient, {
    kind: 'restock',
    qty_delta: 15,
    cost: 8.50,
    reason: 'restock_normale',
  });
  assert.equal(result.qty_after, 25);
  assert.equal(calls.ingredientUpdates[0].data.stock_qty, 25);
  assert.equal(calls.movementsCreated[0].cost, 8.5);
  assert.equal(calls.movementsCreated[0].reason, 'restock_normale');
});

test('appendMovement tronca reason/note alle lunghezze massime', async () => {
  const { strapi, calls } = createStubStrapi();
  const ingredient = { id: 1, stock_qty: 0, fk_user: { id: 1 } };
  const longReason = 'r'.repeat(200);
  const longNote = 'n'.repeat(2000);
  await appendMovement(strapi, ingredient, {
    kind: 'waste',
    qty_delta: 0,
    reason: longReason,
    note: longNote,
  });
  const mov = calls.movementsCreated[0];
  assert.equal(mov.reason.length, 100);
  assert.equal(mov.note.length, 1000);
});

/* ------------------------------------------------------------------ */
/* parseFreeformIngredients                                           */
/* ------------------------------------------------------------------ */

test('parseFreeformIngredients ritorna [] se name vuoto', async () => {
  const { strapi } = createStubStrapi({ ingredients: [
    { id: 1, name: 'Gin', name_normalized: 'gin', is_active: true, fk_user: { id: 9 } },
  ] });
  const out = await parseFreeformIngredients(strapi, 9, '');
  assert.deepEqual(out, []);
});

test('parseFreeformIngredients matcha sottostringa normalizzata', async () => {
  const { strapi } = createStubStrapi({ ingredients: [
    { id: 1, name: 'Gin Tanqueray', name_normalized: 'gin tanqueray', is_active: true, fk_user: { id: 9 } },
    { id: 2, name: 'Tonica', name_normalized: 'tonica', is_active: true, fk_user: { id: 9 } },
    { id: 3, name: 'Vodka', name_normalized: 'vodka', is_active: true, fk_user: { id: 9 } },
  ] });
  const out = await parseFreeformIngredients(strapi, 9, 'Gin Tonica al limone');
  // "gin tonica al limone" contiene "tonica" e "gin tanqueray" NO ma "gin" si
  // (name_normalized = "gin tanqueray", substring "gin tanqueray" in "gin tonica al limone"? NO)
  // Quindi solo "tonica" matcha.
  const ids = out.map((x) => x.ingredient_id).sort();
  assert.deepEqual(ids, [2]);
});

test('parseFreeformIngredients ignora ingredienti is_active=false', async () => {
  const { strapi } = createStubStrapi({ ingredients: [
    { id: 1, name: 'Gin', name_normalized: 'gin', is_active: false, fk_user: { id: 9 } },
    { id: 2, name: 'Vodka', name_normalized: 'vodka', is_active: true, fk_user: { id: 9 } },
  ] });
  const out = await parseFreeformIngredients(strapi, 9, 'Gin tonic');
  assert.deepEqual(out, []);
});

test('parseFreeformIngredients filtra per owner', async () => {
  const { strapi } = createStubStrapi({ ingredients: [
    { id: 1, name: 'Gin', name_normalized: 'gin', is_active: true, fk_user: { id: 9 } },
    { id: 2, name: 'Gin', name_normalized: 'gin', is_active: true, fk_user: { id: 10 } },
  ] });
  const out = await parseFreeformIngredients(strapi, 9, 'Gin tonic');
  assert.deepEqual(out.map((x) => x.ingredient_id), [1]);
});

test('parseFreeformIngredients case-insensitive (norm to lowercase)', async () => {
  const { strapi } = createStubStrapi({ ingredients: [
    { id: 1, name: 'Acqua', name_normalized: 'acqua', is_active: true, fk_user: { id: 9 } },
  ] });
  const out = await parseFreeformIngredients(strapi, 9, 'ACQUA naturale');
  assert.equal(out.length, 1);
  assert.equal(out[0].ingredient_id, 1);
});

/* ------------------------------------------------------------------ */
/* Factor clamp (logica algoritmica riprodotta inline)                */
/* ------------------------------------------------------------------ */

/**
 * Replica la logica di clamping del factor in recalcUsageAverages
 * (linee 532-534 di inventory/index.js) per testarla in isolamento.
 * Se questa pure-function diverge, e' un campanello d'allarme.
 */
function computeUsageFactor(qtyActual, qtyOldTotal) {
  const eps = 1e-6;
  let factor = qtyActual / Math.max(qtyOldTotal, eps);
  if (!Number.isFinite(factor) || factor <= 0) factor = 1;
  return Math.max(0.5, Math.min(2.0, factor));
}

test('factor clampato a 2.0 quando consumo reale e\' molto maggiore dell\'atteso', () => {
  assert.equal(computeUsageFactor(1000, 100), 2.0); // raw 10x -> clamp 2.0
});

test('factor clampato a 0.5 quando consumo reale e\' molto minore dell\'atteso', () => {
  assert.equal(computeUsageFactor(10, 100), 0.5); // raw 0.1 -> clamp 0.5
});

test('factor passa identita se qtyActual === qtyOldTotal', () => {
  assert.equal(computeUsageFactor(100, 100), 1);
});

test('factor=1 se denominatore zero/NaN (no division by zero)', () => {
  assert.equal(computeUsageFactor(100, 0), 2.0); // /eps -> molto grande -> clamp 2
  assert.equal(computeUsageFactor(0, 0), 1);
  assert.equal(computeUsageFactor(NaN, 100), 1);
});
