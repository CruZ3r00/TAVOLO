'use strict';

const MENU_ELEMENT_LINK_TABLES = ['menus_fk_elements_lnk', 'elements_fk_menu_lnk'];

async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function hasColumn(knex, tableName, columnName) {
  if (!(await hasTable(knex, tableName))) return false;
  return knex.schema.hasColumn(tableName, columnName);
}

async function findMenuElementLinkTable(knex) {
  for (const tableName of MENU_ELEMENT_LINK_TABLES) {
    if (await hasColumn(knex, tableName, 'menu_id') && await hasColumn(knex, tableName, 'element_id')) {
      return tableName;
    }
  }

  try {
    const rows = await knex('information_schema.columns')
      .where('table_schema', knex.raw('current_schema()'))
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
  } catch (_err) {
    // SQLite/MySQL dev targets may not expose Postgres information_schema in this shape.
  }

  return null;
}

function isPublishedRow(row) {
  return row && row.published_at !== null && row.published_at !== undefined;
}

function pairMenuRowsToElementRows(menuRows, elementRows) {
  const pairs = [];
  for (const menuRow of menuRows || []) {
    const sameStatus = (elementRows || []).filter((elementRow) => isPublishedRow(elementRow) === isPublishedRow(menuRow));
    const matched = sameStatus.length > 0 ? sameStatus : (elementRows || []);
    for (const elementRow of matched) {
      pairs.push({ menuRow, elementRow });
    }
  }
  return pairs;
}

async function loadDocumentRows(knex, tableName, documentIds) {
  const ids = [...new Set((Array.isArray(documentIds) ? documentIds : [documentIds]).filter(Boolean))];
  if (!ids.length) return [];
  return knex(tableName)
    .whereIn('document_id', ids)
    .select('id', 'document_id', 'published_at')
    .orderBy('document_id', 'asc')
    .orderBy('id', 'asc');
}

function groupByDocumentId(rows) {
  const out = new Map();
  for (const row of rows || []) {
    const key = row.document_id;
    const bucket = out.get(key) || [];
    bucket.push(row);
    out.set(key, bucket);
  }
  return out;
}

async function nextOrderByMenuId(knex, tableName, menuIds, hasOrderColumn) {
  const out = new Map();
  for (const menuId of menuIds) out.set(menuId, 0);
  if (!hasOrderColumn || !menuIds.length) return out;

  const rows = await knex(tableName)
    .whereIn('menu_id', menuIds)
    .groupBy('menu_id')
    .select('menu_id')
    .max({ max_ord: 'element_ord' });

  for (const row of rows || []) {
    out.set(row.menu_id, Number(row.max_ord) || 0);
  }
  return out;
}

async function linkMenuElementsByDocumentId(strapi, menuDocumentId, elementDocumentIds, options = {}) {
  const knex = strapi.db.connection;
  if (!knex) throw new Error('Knex non disponibile per link menu-element.');

  const tableName = await findMenuElementLinkTable(knex);
  if (!tableName) throw new Error('Link table menu-element non trovata.');

  const menuRows = await loadDocumentRows(knex, 'menus', menuDocumentId);
  if (menuRows.length === 0) throw new Error(`Menu document ${menuDocumentId} non trovato.`);

  const elementDocIds = [...new Set((Array.isArray(elementDocumentIds) ? elementDocumentIds : [elementDocumentIds]).filter(Boolean))];
  if (elementDocIds.length === 0) return { linked: 0, tableName };

  const elementRowsByDoc = groupByDocumentId(await loadDocumentRows(knex, 'elements', elementDocIds));
  const missing = elementDocIds.filter((docId) => !elementRowsByDoc.has(docId));
  if (missing.length) throw new Error(`Element document mancanti: ${missing.join(', ')}`);

  const menuIds = menuRows.map((row) => row.id);
  const hasOrderColumn = await hasColumn(knex, tableName, 'element_ord');

  if (options.replace === true) {
    await knex(tableName).whereIn('menu_id', menuIds).delete();
  }

  const nextOrd = await nextOrderByMenuId(knex, tableName, menuIds, hasOrderColumn);
  let linked = 0;

  for (const docId of elementDocIds) {
    const pairs = pairMenuRowsToElementRows(menuRows, elementRowsByDoc.get(docId));
    for (const { menuRow, elementRow } of pairs) {
      const exists = await knex(tableName)
        .where({ menu_id: menuRow.id, element_id: elementRow.id })
        .first('menu_id');
      if (exists) continue;

      const row = {
        menu_id: menuRow.id,
        element_id: elementRow.id,
      };
      if (hasOrderColumn) {
        const next = (nextOrd.get(menuRow.id) || 0) + 1;
        nextOrd.set(menuRow.id, next);
        row.element_ord = next;
      }

      await knex(tableName).insert(row);
      linked += 1;
    }
  }

  return { linked, tableName };
}

module.exports = {
  findMenuElementLinkTable,
  isPublishedRow,
  linkMenuElementsByDocumentId,
  pairMenuRowsToElementRows,
};
