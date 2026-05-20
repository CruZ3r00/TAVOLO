'use strict';

/**
 * Ripara elementi attivi rimasti collegati all'owner ma non al menu.
 *
 * Root cause: su alcuni account legacy Strapi v5 Document Service crea
 * correttamente Element + owner relation, poi fallisce il connect
 * `menu.fk_elements` con "Document with id ..., locale null not found".
 *
 * Questa migration e' idempotente e conservativa:
 *   - non cancella nulla;
 *   - ignora elementi archiviati;
 *   - ripara solo owner con un solo menu document (draft+published ammessi);
 *   - collega draft->draft e published->published quando entrambe le righe
 *     esistono, con fallback se il documento ha una sola riga.
 */

async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function hasColumn(knex, tableName, columnName) {
  if (!(await hasTable(knex, tableName))) return false;
  return knex.schema.hasColumn(tableName, columnName);
}

async function findLinkTable(knex) {
  for (const tableName of ['menus_fk_elements_lnk', 'elements_fk_menu_lnk']) {
    if (await hasColumn(knex, tableName, 'menu_id') && await hasColumn(knex, tableName, 'element_id')) {
      return tableName;
    }
  }
  return null;
}

function isPublished(row) {
  return row && row.published_at !== null && row.published_at !== undefined;
}

function pairedRows(menuRows, elementRows) {
  const out = [];
  for (const menuRow of menuRows) {
    const sameStatus = elementRows.filter((elementRow) => isPublished(elementRow) === isPublished(menuRow));
    const candidates = sameStatus.length > 0 ? sameStatus : elementRows;
    for (const elementRow of candidates) out.push({ menuRow, elementRow });
  }
  return out;
}

async function nextOrdByMenuId(knex, linkTable, menuIds, hasOrd) {
  const out = new Map(menuIds.map((id) => [id, 0]));
  if (!hasOrd || menuIds.length === 0) return out;

  const rows = await knex(linkTable)
    .whereIn('menu_id', menuIds)
    .groupBy('menu_id')
    .select('menu_id')
    .max({ max_ord: 'element_ord' });

  for (const row of rows || []) out.set(row.menu_id, Number(row.max_ord) || 0);
  return out;
}

async function repairOwner(knex, linkTable, ownerId, menuDocumentId) {
  const menuRows = await knex('menus')
    .where('document_id', menuDocumentId)
    .select('id', 'document_id', 'published_at')
    .orderBy('id', 'asc');
  if (menuRows.length === 0) return 0;

  const menuIds = menuRows.map((row) => row.id);
  const ownerElementRows = await knex('elements_fk_user_lnk as u')
    .join('elements as e', 'e.id', 'u.element_id')
    .where('u.user_id', ownerId)
    .where((qb) => {
      qb.whereNull('e.is_archived').orWhere('e.is_archived', false);
    })
    .select('e.id', 'e.document_id', 'e.published_at')
    .orderBy('e.id', 'asc');

  const byDoc = new Map();
  for (const row of ownerElementRows) {
    if (!row.document_id) continue;
    const bucket = byDoc.get(row.document_id) || [];
    bucket.push(row);
    byDoc.set(row.document_id, bucket);
  }

  const linkedDocs = new Set((await knex(`${linkTable} as l`)
    .join('elements as e', 'e.id', 'l.element_id')
    .whereIn('l.menu_id', menuIds)
    .select('e.document_id'))
    .map((row) => row.document_id)
    .filter(Boolean));

  const hasOrd = await hasColumn(knex, linkTable, 'element_ord');
  const nextOrd = await nextOrdByMenuId(knex, linkTable, menuIds, hasOrd);
  let repaired = 0;

  for (const [documentId, elementRows] of byDoc.entries()) {
    if (linkedDocs.has(documentId)) continue;

    for (const { menuRow, elementRow } of pairedRows(menuRows, elementRows)) {
      const exists = await knex(linkTable)
        .where({ menu_id: menuRow.id, element_id: elementRow.id })
        .first('menu_id');
      if (exists) continue;

      const row = { menu_id: menuRow.id, element_id: elementRow.id };
      if (hasOrd) {
        const next = (nextOrd.get(menuRow.id) || 0) + 1;
        nextOrd.set(menuRow.id, next);
        row.element_ord = next;
      }
      await knex(linkTable).insert(row);
      repaired += 1;
    }
  }

  return repaired;
}

module.exports = {
  async up(knex) {
    const requiredTables = ['menus', 'elements', 'menus_fk_user_lnk', 'elements_fk_user_lnk'];
    for (const tableName of requiredTables) {
      if (!(await hasTable(knex, tableName))) {
        console.log(`[repair_menu_element_links] tabella ${tableName} assente, skip.`);
        return;
      }
    }

    const linkTable = await findLinkTable(knex);
    if (!linkTable) {
      console.log('[repair_menu_element_links] link table menu-element assente, skip.');
      return;
    }

    const ownerMenus = await knex('menus_fk_user_lnk as l')
      .join('menus as m', 'm.id', 'l.menu_id')
      .select('l.user_id', 'm.document_id')
      .whereNotNull('m.document_id');

    const menuDocsByOwner = new Map();
    for (const row of ownerMenus) {
      const docs = menuDocsByOwner.get(row.user_id) || new Set();
      docs.add(row.document_id);
      menuDocsByOwner.set(row.user_id, docs);
    }

    let ownersScanned = 0;
    let ownersSkippedMultipleMenus = 0;
    let linksRepaired = 0;

    for (const [ownerId, docs] of menuDocsByOwner.entries()) {
      ownersScanned += 1;
      if (docs.size !== 1) {
        ownersSkippedMultipleMenus += 1;
        continue;
      }
      linksRepaired += await repairOwner(knex, linkTable, ownerId, [...docs][0]);
    }

    console.log(`[repair_menu_element_links] owners=${ownersScanned}, skipped_multiple_menus=${ownersSkippedMultipleMenus}, links_repaired=${linksRepaired}`);
  },

  async down() {
    // One-way repair: non rimuoviamo link menu validi.
  },
};
