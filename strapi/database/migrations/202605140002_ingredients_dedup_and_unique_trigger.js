'use strict';

/**
 * Fase 1 del cleanup ingredienti legacy JSON:
 *
 *   1. Deduplicazione delle righe `ingredients` che condividono lo stesso
 *      `(owner_user_id, name_normalized)`. Le righe duplicate vengono
 *      consolidate sulla canonical (MIN(id)): tutte le FK in tabelle
 *      esterne vengono ridirezionate, le `ElementIngredient` ridondanti
 *      sullo stesso element vengono accorpate, e le righe duplicate
 *      vengono cancellate.
 *
 *   2. Installazione di due trigger PostgreSQL per imporre l'univocita'
 *      logica `(owner, name_normalized)` SENZA denormalizzare l'owner
 *      sulla tabella `ingredients`:
 *        - `trg_ingredients_unique_owner_link` su INSERT/UPDATE in
 *          `ingredients_fk_user_lnk` — copre la creazione di nuovi
 *          ingredient e il riassegnamento di owner.
 *        - `trg_ingredients_unique_on_rename` su UPDATE di
 *          `ingredients.name_normalized` — copre il rename che potrebbe
 *          collidere con un ingrediente esistente dello stesso owner.
 *
 *      Race-safety: i trigger acquisiscono un `pg_advisory_xact_lock`
 *      su `(owner_id, hashtext(name_normalized))` cosi' due transazioni
 *      concorrenti che tentano di creare lo stesso ingrediente vengono
 *      serializzate.
 *
 * Idempotente: ri-eseguire e' no-op (la dedup non trova nulla, i trigger
 * vengono ricreati con CREATE OR REPLACE).
 *
 * Reversibile via `down()`: drop dei trigger. La dedup NON viene
 * rollbackata perche' non e' ricostruibile dallo stato corrente.
 */

const TRIGGER_NAME_LINK = 'trg_ingredients_unique_owner_link';
const TRIGGER_NAME_RENAME = 'trg_ingredients_unique_on_rename';
const FUNC_NAME_LINK = 'enforce_unique_ingredient_per_owner';
const FUNC_NAME_RENAME = 'enforce_unique_ingredient_on_rename';

async function hasTable(knex, name) {
  return knex.schema.hasTable(name);
}

/**
 * Restituisce le righe duplicate raggruppate per (owner, name_normalized).
 * Output: [{ owner_id, name_normalized, ids: [int] }]
 */
async function findDuplicates(knex) {
  const rows = await knex.raw(`
    SELECT
      lnk.user_id AS owner_id,
      i.name_normalized AS name_normalized,
      array_agg(i.id ORDER BY i.id) AS ids
    FROM ingredients i
    JOIN ingredients_fk_user_lnk lnk ON lnk.ingredient_id = i.id
    GROUP BY lnk.user_id, i.name_normalized
    HAVING COUNT(*) > 1
  `);
  return rows.rows || [];
}

/**
 * Consolida un singolo ingredient duplicato `dupId` su `canonicalId`.
 * Esegue tutto in una sub-transazione (gestita dal caller).
 *
 * Step:
 *  1) Aggiorna le FK in `inventory_movements_fk_ingredient_lnk` e
 *     `restock_orders_fk_ingredient_lnk` (nessun vincolo unique: update diretto).
 *  2) Per `element_ingredients_fk_ingredient_lnk`: ridireziona dup → canonical,
 *     ma se canonical e' gia' linkato a stesso `element_ingredient_id`,
 *     elimina il link duplicato. Se l'`element_ingredient_id` resta orfano
 *     di ingredient, lo cancello insieme ai suoi link element.
 *  3) Rimuove le `ElementIngredient` ridondanti per stesso (element_id,
 *     canonical_ingredient_id): tiene la riga con id piu' basso,
 *     cancella gli altri (link + riga).
 *  4) Elimina il link `ingredients_fk_user_lnk(dup, owner)` e la riga
 *     `ingredients` per `dup`.
 */
async function consolidateDuplicate(knex, dupId, canonicalId, ownerId) {
  // 1) FK semplici: redirezione diretta
  if (await hasTable(knex, 'inventory_movements_fk_ingredient_lnk')) {
    await knex('inventory_movements_fk_ingredient_lnk')
      .where('ingredient_id', dupId)
      .update({ ingredient_id: canonicalId });
  }
  if (await hasTable(knex, 'restock_orders_fk_ingredient_lnk')) {
    await knex('restock_orders_fk_ingredient_lnk')
      .where('ingredient_id', dupId)
      .update({ ingredient_id: canonicalId });
  }

  // 2) element_ingredients_fk_ingredient_lnk: ridirezione con gestione duplicati
  const eiLinks = await knex('element_ingredients_fk_ingredient_lnk')
    .where('ingredient_id', dupId)
    .pluck('element_ingredient_id');

  for (const eiId of eiLinks) {
    // Esiste gia' un link canonical→eiId?
    const existingCanonical = await knex('element_ingredients_fk_ingredient_lnk')
      .where('element_ingredient_id', eiId)
      .where('ingredient_id', canonicalId)
      .first();

    if (existingCanonical) {
      // Conflict: stesso ei punta gia' a canonical. Drop il dup link.
      await knex('element_ingredients_fk_ingredient_lnk')
        .where('element_ingredient_id', eiId)
        .where('ingredient_id', dupId)
        .delete();

      // L'ei e' rimasta con un solo link a canonical: ok, e' una EI legittima.
      // Andra' deduplicata nello step 3 se collide con altre ei sullo stesso element.
    } else {
      // Ridireziona dup → canonical
      await knex('element_ingredients_fk_ingredient_lnk')
        .where('element_ingredient_id', eiId)
        .where('ingredient_id', dupId)
        .update({ ingredient_id: canonicalId });
    }
  }

  // 3) Dedup ElementIngredient ridondanti per (element_id, ingredient_id=canonical)
  //    che possono essersi create dopo la redirection. Tengo la riga con id
  //    piu' basso, sommo qty_per_serving prendendo MAX.
  const redundant = await knex.raw(`
    SELECT
      ellnk.element_id,
      array_agg(ei.id ORDER BY ei.id) AS ei_ids,
      MAX(ei.qty_per_serving) AS max_qty
    FROM element_ingredients ei
    JOIN element_ingredients_fk_element_lnk ellnk ON ellnk.element_ingredient_id = ei.id
    JOIN element_ingredients_fk_ingredient_lnk ilnk ON ilnk.element_ingredient_id = ei.id
    WHERE ilnk.ingredient_id = ?
    GROUP BY ellnk.element_id
    HAVING COUNT(*) > 1
  `, [canonicalId]);

  for (const row of redundant.rows || []) {
    const ids = row.ei_ids;
    const keep = ids[0];
    const drop = ids.slice(1);
    // Allinea qty_per_serving al MAX
    await knex('element_ingredients').where('id', keep).update({
      qty_per_serving: row.max_qty,
      updated_at: new Date(),
    });
    // Cancella i link e le righe ridondanti
    await knex('element_ingredients_fk_element_lnk').whereIn('element_ingredient_id', drop).delete();
    await knex('element_ingredients_fk_ingredient_lnk').whereIn('element_ingredient_id', drop).delete();
    await knex('element_ingredients').whereIn('id', drop).delete();
  }

  // 4) Cleanup: rimuovi link owner+ingredients per dup
  await knex('ingredients_fk_user_lnk')
    .where('ingredient_id', dupId)
    .where('user_id', ownerId)
    .delete();
  // Se restano altri lnk verso dup (non dovrebbero), li lascio: il delete
  // sulla riga ingredients sotto fallirebbe se ci fossero FK pendenti.
  await knex('ingredients').where('id', dupId).delete();
}

module.exports = {
  async up(knex) {
    // Sanity: tabelle indispensabili presenti
    const required = [
      'ingredients',
      'ingredients_fk_user_lnk',
      'element_ingredients',
      'element_ingredients_fk_element_lnk',
      'element_ingredients_fk_ingredient_lnk',
    ];
    for (const t of required) {
      if (!(await hasTable(knex, t))) {
        console.log(`[ingredients_dedup_unique] tabella ${t} mancante, skip.`);
        return;
      }
    }

    // 1) Dedup
    const groups = await findDuplicates(knex);
    let totalMerged = 0;
    for (const g of groups) {
      const ids = g.ids || [];
      if (ids.length <= 1) continue;
      const canonical = ids[0];
      const dups = ids.slice(1);
      for (const dupId of dups) {
        try {
          await consolidateDuplicate(knex, dupId, canonical, g.owner_id);
          totalMerged += 1;
        } catch (err) {
          console.warn(
            `[ingredients_dedup_unique] merge owner=${g.owner_id} name="${g.name_normalized}" dup=${dupId} → canonical=${canonical} fallito: ${err.message}`
          );
        }
      }
    }
    console.log(
      `[ingredients_dedup_unique] consolidati ${totalMerged} ingredient duplicati su ${groups.length} gruppi (owner, name_normalized).`
    );

    // 2) Verifica post-dedup: 0 duplicati attesi
    const stillDup = await findDuplicates(knex);
    if (stillDup.length > 0) {
      throw new Error(
        `[ingredients_dedup_unique] dedup non completa: rimangono ${stillDup.length} gruppi duplicati. Interrompo prima del trigger.`
      );
    }

    // 3) Trigger PG per univocita' (owner, name_normalized)
    //    su `ingredients_fk_user_lnk` (INSERT/UPDATE) e su
    //    `ingredients` (UPDATE OF name_normalized).
    await knex.raw(`
      CREATE OR REPLACE FUNCTION ${FUNC_NAME_LINK}() RETURNS trigger AS $func$
      DECLARE
        v_name_norm TEXT;
        v_dup INT;
      BEGIN
        SELECT name_normalized INTO v_name_norm FROM ingredients WHERE id = NEW.ingredient_id;
        IF v_name_norm IS NULL OR v_name_norm = '' THEN
          RETURN NEW;
        END IF;

        PERFORM pg_advisory_xact_lock(NEW.user_id, hashtext(v_name_norm));

        SELECT COUNT(*) INTO v_dup
        FROM ingredients_fk_user_lnk lnk
        JOIN ingredients i ON i.id = lnk.ingredient_id
        WHERE lnk.user_id = NEW.user_id
          AND lnk.ingredient_id <> NEW.ingredient_id
          AND i.name_normalized = v_name_norm;

        IF v_dup > 0 THEN
          RAISE EXCEPTION 'duplicate ingredient name % for user_id=%', v_name_norm, NEW.user_id
            USING ERRCODE = 'unique_violation';
        END IF;

        RETURN NEW;
      END;
      $func$ LANGUAGE plpgsql;
    `);

    await knex.raw(`DROP TRIGGER IF EXISTS ${TRIGGER_NAME_LINK} ON ingredients_fk_user_lnk;`);
    await knex.raw(`
      CREATE TRIGGER ${TRIGGER_NAME_LINK}
      BEFORE INSERT OR UPDATE ON ingredients_fk_user_lnk
      FOR EACH ROW EXECUTE FUNCTION ${FUNC_NAME_LINK}();
    `);

    await knex.raw(`
      CREATE OR REPLACE FUNCTION ${FUNC_NAME_RENAME}() RETURNS trigger AS $func$
      DECLARE
        v_owner_id INT;
        v_dup INT;
      BEGIN
        IF NEW.name_normalized IS NULL OR NEW.name_normalized = '' THEN
          RETURN NEW;
        END IF;
        IF OLD.name_normalized IS NOT NULL AND NEW.name_normalized = OLD.name_normalized THEN
          RETURN NEW;
        END IF;

        SELECT user_id INTO v_owner_id FROM ingredients_fk_user_lnk WHERE ingredient_id = NEW.id LIMIT 1;
        IF v_owner_id IS NULL THEN
          RETURN NEW;
        END IF;

        PERFORM pg_advisory_xact_lock(v_owner_id, hashtext(NEW.name_normalized));

        SELECT COUNT(*) INTO v_dup
        FROM ingredients_fk_user_lnk lnk
        JOIN ingredients i ON i.id = lnk.ingredient_id
        WHERE lnk.user_id = v_owner_id
          AND lnk.ingredient_id <> NEW.id
          AND i.name_normalized = NEW.name_normalized;

        IF v_dup > 0 THEN
          RAISE EXCEPTION 'rename to duplicate name % for user_id=%', NEW.name_normalized, v_owner_id
            USING ERRCODE = 'unique_violation';
        END IF;

        RETURN NEW;
      END;
      $func$ LANGUAGE plpgsql;
    `);

    await knex.raw(`DROP TRIGGER IF EXISTS ${TRIGGER_NAME_RENAME} ON ingredients;`);
    await knex.raw(`
      CREATE TRIGGER ${TRIGGER_NAME_RENAME}
      BEFORE UPDATE OF name_normalized ON ingredients
      FOR EACH ROW EXECUTE FUNCTION ${FUNC_NAME_RENAME}();
    `);

    console.log('[ingredients_dedup_unique] trigger installati: ' + TRIGGER_NAME_LINK + ', ' + TRIGGER_NAME_RENAME);
  },

  async down(knex) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${TRIGGER_NAME_LINK} ON ingredients_fk_user_lnk;`);
    await knex.raw(`DROP TRIGGER IF EXISTS ${TRIGGER_NAME_RENAME} ON ingredients;`);
    await knex.raw(`DROP FUNCTION IF EXISTS ${FUNC_NAME_LINK}();`);
    await knex.raw(`DROP FUNCTION IF EXISTS ${FUNC_NAME_RENAME}();`);
  },
};
