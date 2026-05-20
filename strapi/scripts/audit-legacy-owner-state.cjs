#!/usr/bin/env node
'use strict';

/**
 * Read-only audit for legacy owner/menu/element state.
 *
 * Usage:
 *   node scripts/audit-legacy-owner-state.cjs --owner=1
 *   node scripts/audit-legacy-owner-state.cjs --owner=1 --compare=2
 *   node scripts/audit-legacy-owner-state.cjs --doc=2d28c24c06364d4da6a480a2
 *   node scripts/audit-legacy-owner-state.cjs --all-active
 *
 * The script loads strapi/.env but never prints secret env values.
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const knexFactory = require('knex');

const ROOT = path.resolve(__dirname, '..');

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const envFileArg = argValue('env-file');
const envFile = envFileArg
  ? path.resolve(ROOT, envFileArg)
  : path.join(ROOT, '.env');
if (!fs.existsSync(envFile)) {
  console.error(JSON.stringify({ error: `Env file non trovato: ${envFile}` }, null, 2));
  process.exit(1);
}
dotenv.config({ path: envFile });

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function asInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function maskEmail(email) {
  const value = String(email || '');
  const at = value.indexOf('@');
  if (at <= 1) return value ? '[masked]' : null;
  return `${value[0]}***${value.slice(at)}`;
}

function compactRows(rows, max = 20) {
  if (!Array.isArray(rows)) return [];
  if (rows.length <= max) return rows;
  return [...rows.slice(0, max), { truncated: rows.length - max }];
}

async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function hasColumn(knex, tableName, columnName) {
  if (!(await hasTable(knex, tableName))) return false;
  return knex.schema.hasColumn(tableName, columnName);
}

function dbConfig() {
  const client = process.env.DATABASE_CLIENT || 'sqlite';
  const sslRejectOverride = argValue('ssl-reject-unauthorized');
  const rejectUnauthorized = sslRejectOverride !== null
    ? String(sslRejectOverride).toLowerCase() !== 'false'
    : String(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';
  if (client === 'postgres') {
    return {
      client: 'pg',
      connection: {
        host: process.env.DATABASE_HOST || 'localhost',
        port: Number(process.env.DATABASE_PORT || 5432),
        database: process.env.DATABASE_NAME || 'strapi',
        user: process.env.DATABASE_USERNAME || 'strapi',
        password: process.env.DATABASE_PASSWORD || '',
        ssl: String(process.env.DATABASE_SSL || '').toLowerCase() === 'true'
          ? { rejectUnauthorized }
          : false,
        schema: process.env.DATABASE_SCHEMA || 'public',
      },
      pool: { min: 0, max: 2 },
    };
  }
  if (client === 'mysql') {
    return {
      client: 'mysql2',
      connection: {
        host: process.env.DATABASE_HOST || '127.0.0.1',
        port: Number(process.env.DATABASE_PORT || 3306),
        database: process.env.DATABASE_NAME || 'cms-restaurants',
        user: process.env.DATABASE_USERNAME || 'cms-admin',
        password: process.env.DATABASE_PASSWORD || '',
      },
      pool: { min: 0, max: 2 },
    };
  }
  return {
    client: 'better-sqlite3',
    connection: {
      filename: path.join(ROOT, process.env.DATABASE_FILENAME || '.tmp/data.db'),
    },
    useNullAsDefault: true,
  };
}

async function findMenuElementLinkTable(knex) {
  const candidates = ['menus_fk_elements_lnk', 'elements_fk_menu_lnk'];
  for (const tableName of candidates) {
    if (!(await hasTable(knex, tableName))) continue;
    if (await hasColumn(knex, tableName, 'menu_id') && await hasColumn(knex, tableName, 'element_id')) {
      return tableName;
    }
  }

  const hasInfoSchema = await hasTable(knex, 'information_schema.columns').catch(() => false);
  if (hasInfoSchema) {
    const rows = await knex('information_schema.columns')
      .whereIn('column_name', ['menu_id', 'element_id'])
      .select('table_name', 'column_name');
    const byTable = new Map();
    for (const row of rows || []) {
      const cols = byTable.get(row.table_name) || new Set();
      cols.add(row.column_name);
      byTable.set(row.table_name, cols);
    }
    for (const [tableName, cols] of byTable.entries()) {
      if (cols.has('menu_id') && cols.has('element_id')) return tableName;
    }
  }

  return null;
}

async function tableColumns(knex, tableName) {
  if (!(await hasTable(knex, tableName))) return [];
  return knex(tableName).columnInfo().then((info) => Object.keys(info || {}));
}

async function tableColumnInfo(knex, tableName) {
  if (!(await hasTable(knex, tableName))) return {};
  const info = await knex(tableName).columnInfo();
  return Object.fromEntries(Object.entries(info || {}).map(([name, meta]) => [
    name,
    {
      type: meta.type,
      nullable: meta.nullable,
      defaultValue: meta.defaultValue,
    },
  ]));
}

async function ownerRow(knex, ownerId) {
  const rows = await knex('up_users')
    .where('id', ownerId)
    .select(
      'id',
      'document_id',
      'username',
      'email',
      'subscription_status',
      'subscription_plan',
      'subscription_current_period_end',
      'end_subscription',
      'stripe_subscription_id',
    );
  const user = rows[0] || null;
  if (!user) return null;
  return {
    ...user,
    email: maskEmail(user.email),
    has_stripe_subscription_id: !!user.stripe_subscription_id,
    stripe_subscription_id: undefined,
  };
}

async function linkedMenus(knex, ownerId) {
  if (!(await hasTable(knex, 'menus_fk_user_lnk'))) return [];
  return knex('menus_fk_user_lnk as l')
    .leftJoin('menus as m', 'm.id', 'l.menu_id')
    .where('l.user_id', ownerId)
    .select(
      'l.menu_id',
      'm.document_id',
      'm.published_at',
      'm.created_at',
      'm.updated_at',
    )
    .orderBy('l.menu_id', 'asc');
}

async function menuDocumentRows(knex, menuDocumentIds) {
  const ids = [...new Set(menuDocumentIds.filter(Boolean))];
  if (!ids.length) return [];
  return knex('menus')
    .whereIn('document_id', ids)
    .select('id', 'document_id', 'published_at', 'created_at', 'updated_at')
    .orderBy(['document_id', 'id']);
}

async function ownerElements(knex, ownerId) {
  if (!(await hasTable(knex, 'elements_fk_user_lnk'))) return [];
  return knex('elements_fk_user_lnk as l')
    .leftJoin('elements as e', 'e.id', 'l.element_id')
    .where('l.user_id', ownerId)
    .select(
      'l.element_id',
      'e.document_id',
      'e.name',
      'e.category',
      'e.is_archived',
      'e.published_at',
      'e.created_at',
      'e.updated_at',
    )
    .orderBy('l.element_id', 'asc');
}

async function menuElementLinks(knex, tableName, menuIds) {
  if (!tableName || !menuIds.length) return [];
  return knex(`${tableName} as l`)
    .leftJoin('elements as e', 'e.id', 'l.element_id')
    .whereIn('l.menu_id', menuIds)
    .select(
      'l.menu_id',
      'l.element_id',
      'e.document_id',
      'e.name',
      'e.category',
      'e.is_archived',
      'e.published_at',
    )
    .orderBy(['l.menu_id', 'l.element_id']);
}

async function findDocument(knex, docId) {
  const result = {};
  for (const tableName of ['menus', 'elements', 'up_users']) {
    if (!(await hasTable(knex, tableName))) continue;
    if (!(await hasColumn(knex, tableName, 'document_id'))) continue;
    result[tableName] = await knex(tableName)
      .where('document_id', docId)
      .select('*')
      .then((rows) => rows.map((row) => ({
        id: row.id,
        document_id: row.document_id,
        name: row.name,
        username: row.username,
        category: row.category,
        published_at: row.published_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })));
  }
  return result;
}

function summarizeOwner({ owner, menus, menuRows, elements, links, linkTable }) {
  const issues = [];
  const menuDocs = new Set(menus.map((m) => m.document_id).filter(Boolean));
  const menuIds = new Set(menus.map((m) => m.menu_id).filter(Boolean));
  const ownerElementDocs = new Set(elements.map((e) => e.document_id).filter(Boolean));
  const linkedElementDocs = new Set(links.map((l) => l.document_id).filter(Boolean));

  if (!owner) issues.push('owner_missing');
  if (menus.length === 0) issues.push('no_menu_linked_to_owner');
  if (menuDocs.size > 1) issues.push('multiple_menu_documents_for_owner');
  if (menus.some((m) => !m.document_id)) issues.push('menu_link_points_to_missing_menu_row');
  if (menuRows.length > 0 && !menuRows.some((m) => m.published_at)) issues.push('menu_document_has_no_published_row');
  if (elements.some((e) => !e.document_id)) issues.push('element_owner_link_points_to_missing_element_row');
  if (links.some((l) => !l.document_id)) issues.push('menu_element_link_points_to_missing_element_row');
  if (!linkTable) issues.push('menu_element_link_table_not_detected');

  const linkedNotOwned = [...linkedElementDocs].filter((doc) => !ownerElementDocs.has(doc));
  const ownedNotLinked = [...ownerElementDocs].filter((doc) => !linkedElementDocs.has(doc));
  const latestElementByDoc = new Map();
  for (const row of elements || []) {
    if (!row.document_id) continue;
    const prev = latestElementByDoc.get(row.document_id);
    if (!prev || Number(Boolean(row.published_at)) > Number(Boolean(prev.published_at)) || row.element_id > prev.element_id) {
      latestElementByDoc.set(row.document_id, row);
    }
  }
  const ownedNotLinkedRows = ownedNotLinked.map((doc) => latestElementByDoc.get(doc) || { document_id: doc });
  if (linkedNotOwned.length) issues.push('menu_links_elements_not_owned_by_owner');
  if (ownedNotLinkedRows.some((row) => row && row.is_archived !== true)) issues.push('owner_elements_not_linked_to_menu');
  else if (ownedNotLinked.length) issues.push('archived_owner_elements_not_linked_to_menu');

  const menuRowsByDoc = {};
  for (const row of menuRows) {
    const key = row.document_id || 'null';
    menuRowsByDoc[key] = menuRowsByDoc[key] || { total: 0, published: 0, draft: 0, ids: [] };
    menuRowsByDoc[key].total += 1;
    if (row.published_at) menuRowsByDoc[key].published += 1;
    else menuRowsByDoc[key].draft += 1;
    menuRowsByDoc[key].ids.push(row.id);
  }

  return {
    owner,
    counts: {
      linked_menu_rows: menus.length,
      distinct_menu_documents: menuDocs.size,
      menu_document_rows: menuRows.length,
      owner_element_rows: elements.length,
      distinct_owner_element_documents: ownerElementDocs.size,
      menu_element_link_rows: links.length,
      distinct_menu_linked_element_documents: linkedElementDocs.size,
      linked_menu_ids: [...menuIds],
    },
    menu_rows_by_document: menuRowsByDoc,
    issues,
    linked_elements_not_owned: compactRows(linkedNotOwned),
    owner_elements_not_linked: compactRows(ownedNotLinkedRows.map((row) => ({
      document_id: row.document_id,
      id: row.element_id,
      name: row.name,
      category: row.category,
      is_archived: row.is_archived,
      published_at: row.published_at,
    }))),
    samples: {
      menus: compactRows(menus),
      elements: compactRows(elements.map((e) => ({
        id: e.element_id,
        document_id: e.document_id,
        name: e.name,
        category: e.category,
        published_at: e.published_at,
      }))),
      menu_links: compactRows(links),
    },
  };
}

async function auditOwner(knex, ownerId, linkTable) {
  const owner = await ownerRow(knex, ownerId);
  const menus = await linkedMenus(knex, ownerId);
  const menuRows = await menuDocumentRows(knex, menus.map((m) => m.document_id));
  const elements = await ownerElements(knex, ownerId);
  const links = await menuElementLinks(knex, linkTable, menus.map((m) => m.menu_id).filter(Boolean));
  return summarizeOwner({ owner, menus, menuRows, elements, links, linkTable });
}

async function activeOwnerIds(knex) {
  return knex('up_users')
    .whereIn('subscription_status', ['active', 'trialing'])
    .select('id')
    .orderBy('id', 'asc')
    .then((rows) => rows.map((r) => r.id));
}

async function main() {
  const knex = knexFactory(dbConfig());
  try {
    const linkTable = await findMenuElementLinkTable(knex);
    const schema = {
      envFile: path.relative(ROOT, envFile),
      client: process.env.DATABASE_CLIENT || 'sqlite',
      linkTable,
      tables: {
        menus: await tableColumns(knex, 'menus'),
        elements: await tableColumns(knex, 'elements'),
        menus_fk_user_lnk: await tableColumns(knex, 'menus_fk_user_lnk'),
        elements_fk_user_lnk: await tableColumns(knex, 'elements_fk_user_lnk'),
        menu_element_link: linkTable ? await tableColumns(knex, linkTable) : [],
      },
      linkTableInfo: linkTable ? await tableColumnInfo(knex, linkTable) : {},
    };

    const output = { schema, owners: {}, documents: {} };
    const ownerIds = [];
    const owner = asInt(argValue('owner'));
    const compare = asInt(argValue('compare'));
    if (owner) ownerIds.push(owner);
    if (compare) ownerIds.push(compare);
    if (hasFlag('all-active')) ownerIds.push(...await activeOwnerIds(knex));

    for (const ownerId of [...new Set(ownerIds)]) {
      output.owners[ownerId] = await auditOwner(knex, ownerId, linkTable);
    }

    const docId = argValue('doc');
    if (docId) {
      output.documents[docId] = await findDocument(knex, docId);
    }

    if (Object.keys(output.owners).length === 0 && Object.keys(output.documents).length === 0) {
      output.usage = 'Pass --owner=<id>, --compare=<id>, --all-active, or --doc=<documentId>.';
    }

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await knex.destroy();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({
    error: err.message,
    stack: String(err.stack || '').split('\n').slice(0, 5),
  }, null, 2));
  process.exitCode = 1;
});
