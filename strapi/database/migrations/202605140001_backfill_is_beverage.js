'use strict';

/**
 * Backfill `Element.is_beverage` per tutti gli element esistenti, in modo
 * coerente con il routing staff:
 *   - Se l'owner ha pro routing E ha un override in `restaurant_category_routing`
 *     per la categoria di quell'element → `is_beverage = (staff_role === 'bar')`.
 *   - Altrimenti → fallback regex (`classifyCategory(category) === 'bar'`).
 *
 * Lo slot bevande del menu deve sempre coincidere con lo slot dello staff "bar"
 * finche l'owner non riassegna manualmente la categoria. Questa migrazione
 * normalizza lo stato corrente; il mantenimento runtime e' gestito da
 * `element.create/update` (auto-classify) e da `account.updateCategoryRouting`
 * (propagazione su cambio routing).
 *
 * Idempotente: rigirare la migration non produce side-effect (UPDATE solo se
 * il valore corrente differisce da quello atteso).
 */

const BAR_REGEX = /(bevande|bibite|drink|cocktail|vino|vini|birra|birre|amari|liquori|distillati|aperitivi|\bbar\b|caffe|caffè|acqua|soft drink|analcolic)/i;
const SG_REGEX = /(senza glutine|gluten free|gluten-free|\bsg\b|celiac|celiach)/i;
const PIZZA_REGEX = /(pizza|pizze|pizzeria|focaccia|calzone)/i;

function classifyCategory(category) {
  const value = String(category || '').trim().toLowerCase();
  if (!value) return 'cucina';
  if (BAR_REGEX.test(value)) return 'bar';
  if (SG_REGEX.test(value)) return 'cucina_sg';
  if (PIZZA_REGEX.test(value)) return 'pizzeria';
  return 'cucina';
}

function isProRouting(owner) {
  if (!owner) return false;
  if (!['active', 'trialing'].includes(owner.subscription_status)) return false;
  const plan = String(owner.subscription_plan || '').toLowerCase();
  if (plan !== 'pro') return false;
  const periodEnd = owner.subscription_current_period_end || owner.end_subscription;
  if (!periodEnd) return true;
  const periodEndDate = new Date(periodEnd);
  return !Number.isNaN(periodEndDate.getTime()) && periodEndDate.getTime() >= Date.now();
}

async function ensureBooleanColumn(knex, tableName, columnName, defaultValue = false) {
  if (!(await knex.schema.hasTable(tableName))) return false;
  if (await knex.schema.hasColumn(tableName, columnName)) return true;

  await knex.schema.alterTable(tableName, (table) => {
    table.boolean(columnName).defaultTo(defaultValue);
  });

  return true;
}

async function up(knex) {
  const hasIsBeverage = await ensureBooleanColumn(knex, 'elements', 'is_beverage', false);
  if (!hasIsBeverage) return 0;

  // 1) Carica owner con campi subscription per decidere pro vs non-pro.
  const owners = await knex('up_users').select(
    'id', 'subscription_status', 'subscription_plan',
    'subscription_current_period_end', 'end_subscription',
  );

  // 2) Carica tutti gli override esistenti in restaurant_category_routing.
  let routingMap = new Map(); // owner_id -> Map(categoryLower -> staff_role)
  const hasRoutingTable = await knex.schema.hasTable('restaurant_category_routing');
  if (hasRoutingTable) {
    const rows = await knex('restaurant_category_routing').select('owner_id', 'category', 'staff_role');
    for (const r of rows || []) {
      if (!routingMap.has(r.owner_id)) routingMap.set(r.owner_id, new Map());
      routingMap.get(r.owner_id).set(String(r.category || '').toLowerCase(), r.staff_role);
    }
  }

  // 3) Per ogni owner: carica i suoi element + calcola is_beverage atteso.
  let updates = 0;
  for (const owner of owners) {
    const pro = isProRouting(owner);
    const ownerOverrides = routingMap.get(owner.id) || new Map();

    const elements = await knex('elements as e')
      .join('elements_fk_user_lnk as l', 'l.element_id', 'e.id')
      .where('l.user_id', owner.id)
      .select('e.id', 'e.category', 'e.is_beverage');

    const toTrue = [];
    const toFalse = [];
    for (const el of elements) {
      let expected;
      const catKey = String(el.category || '').trim().toLowerCase();
      if (pro && ownerOverrides.has(catKey)) {
        expected = ownerOverrides.get(catKey) === 'bar';
      } else {
        expected = classifyCategory(el.category) === 'bar';
      }
      const current = el.is_beverage === true;
      if (current === expected) continue;
      if (expected) toTrue.push(el.id);
      else toFalse.push(el.id);
    }

    if (toTrue.length > 0) {
      await knex('elements').whereIn('id', toTrue).update({ is_beverage: true });
      updates += toTrue.length;
    }
    if (toFalse.length > 0) {
      await knex('elements').whereIn('id', toFalse).update({ is_beverage: false });
      updates += toFalse.length;
    }
  }

  return updates;
}

async function down() {
  // No-op: backfill non distruttivo. Il rollback richiederebbe uno snapshot
  // pre-migration di `is_beverage`, fuori scope.
}

module.exports = { up, down };
