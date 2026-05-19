'use strict';

/**
 * Test stats.bumpVoided (FASE 6.3): upsert idempotente, somma su row esistente,
 * creazione row con default a zero se mancante.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { bumpVoided } = require('../src/services/stats');

function createStrapiStub(initialRow = null) {
  const state = {
    row: initialRow,
    creates: [],
    updates: [],
  };
  const strapi = {
    log: { warn() {}, error() {}, info() {} },
    db: {
      query(uid) {
        if (uid === 'api::restaurant-daily-stat.restaurant-daily-stat') {
          return {
            findMany: async () => (state.row ? [state.row] : []),
          };
        }
        return { findMany: async () => [] };
      },
    },
    documents(uid) {
      if (uid === 'api::restaurant-daily-stat.restaurant-daily-stat') {
        return {
          create: async ({ data }) => {
            state.row = { documentId: 'doc-new', ...data };
            state.creates.push(data);
            return state.row;
          },
          update: async ({ documentId, data }) => {
            state.row = { ...state.row, ...data, documentId };
            state.updates.push({ documentId, data });
            return state.row;
          },
        };
      }
      return { create: async () => null, update: async () => null };
    },
  };
  return { strapi, state };
}

test('bumpVoided crea row con default a zero se mancante per (userId, date)', async () => {
  const { strapi, state } = createStrapiStub(null);
  await bumpVoided(strapi, { userId: 1, dateKey: '2026-05-13', count: 1, revenueLost: 12.50 });
  assert.equal(state.creates.length, 1);
  const created = state.creates[0];
  assert.equal(created.date, '2026-05-13');
  assert.equal(created.voided_count, 1);
  assert.equal(created.voided_revenue_lost, 12.5);
  // I contatori "normali" devono partire a zero per non sporcare la revenue
  assert.equal(created.orders_count, 0);
  assert.equal(created.customers_count, 0);
  assert.equal(created.revenue, 0);
  assert.equal(created.items_sold, 0);
});

test('bumpVoided somma su row esistente senza alterare gli altri contatori', async () => {
  const existing = {
    documentId: 'doc-1',
    date: '2026-05-13',
    voided_count: 3,
    voided_revenue_lost: 25,
    orders_count: 10,
    revenue: 500,
    customers_count: 30,
  };
  const { strapi, state } = createStrapiStub(existing);
  await bumpVoided(strapi, { userId: 1, dateKey: '2026-05-13', count: 2, revenueLost: 15 });
  assert.equal(state.updates.length, 1);
  assert.equal(state.creates.length, 0);
  const patch = state.updates[0].data;
  assert.equal(patch.voided_count, 5);          // 3 + 2
  assert.equal(patch.voided_revenue_lost, 40);  // 25 + 15
  // I contatori non-voided NON devono essere nel patch
  assert.equal(patch.orders_count, undefined);
  assert.equal(patch.revenue, undefined);
});

test('bumpVoided e\' no-op se count<=0 e revenueLost<=0', async () => {
  const { strapi, state } = createStrapiStub(null);
  const out = await bumpVoided(strapi, { userId: 1, dateKey: '2026-05-13', count: 0, revenueLost: 0 });
  assert.equal(out, null);
  assert.equal(state.creates.length, 0);
  assert.equal(state.updates.length, 0);
});

test('bumpVoided e\' no-op senza userId o dateKey', async () => {
  const { strapi, state } = createStrapiStub(null);
  assert.equal(await bumpVoided(strapi, { userId: 0, dateKey: '2026-05-13', count: 1, revenueLost: 5 }), null);
  assert.equal(await bumpVoided(strapi, { userId: 1, dateKey: null, count: 1, revenueLost: 5 }), null);
  assert.equal(state.creates.length, 0);
  assert.equal(state.updates.length, 0);
});

test('bumpVoided coerce stringhe in numeri (defensive)', async () => {
  const { strapi, state } = createStrapiStub(null);
  await bumpVoided(strapi, { userId: 1, dateKey: '2026-05-13', count: '3', revenueLost: '7.25' });
  const created = state.creates[0];
  assert.equal(created.voided_count, 3);
  assert.equal(created.voided_revenue_lost, 7.25);
});
