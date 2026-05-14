# Deploy Bar + Magazzino avanzato (FASE 7)

Procedura operativa per rilasciare le funzionalita' delle FASI 0-5 (Bar/Bevande
+ Pantry pro + Voided OrderItem) in staging e in produzione.

> **Premessa di sicurezza.** Il DB Supabase di produzione condivide
> credenziali con lo Strapi locale, quindi:
> - **MAI** lanciare `npm run dev` con env di produzione (sincronizza schema
>   automaticamente: rischio drift).
> - Le modifiche di schema vanno tutte tramite migrazioni knex idempotenti
>   in `strapi/database/migrations/`, applicate da Strapi al boot
>   (`npm run start`) sia in dev che in prod.
> - `npm run build` e' sempre safe (compila solo l'admin).

## 1. Riepilogo migrazioni

Ordine cronologico (knex le esegue per timestamp del filename):

| Timestamp | File | Scopo |
|---|---|---|
| 202604210001 | `add_operational_indexes.js` | Indici base orders/reservations (pre-bar) |
| 202605040001 | `add_order_item_course_fields.js` | OrderItem.category/course |
| 202605060001 | `add_takeaway_fields.js` | Order.takeaway_* |
| 202605070001 | `drop_preferences.js` | Cleanup tabella preferences |
| 202605070002 | `create_restaurant_staff.js` | Staff multi-utente |
| 202605070003 | `category_routing_active_staff_patch.js` | Routing reparti |
| 202605070004 | `category_routing_manual_assignments_patch.js` | Mappa custom |
| 202605080001 | `add_station_order_indexes.js` | Indici station-based |
| **202605130001** | `bar_inventory_indexes.js` | **FASE 0** — indici bar/inventario |
| 202605130002 | `ingredients_backfill.js` | Backfill ingredients da Element.ingredients JSON |
| **202605140001** | `void_and_stats_columns.js` | **FASE 5** — colonne voided + served_at + voided_count |

Tutte idempotenti (hasTable/hasColumn check + try/catch su duplicate).

## 2. Verifica pre-deploy (locale)

```bash
# 1. test unit
cd strapi && npm test                # 36 test devono passare

# 2. build (NON tocca DB)
cd strapi && npm run build           # ~50-90s
cd ../vuejs/frontend && npm run build:modern   # ~10-15s
npm run build:legacy                            # ~60-90s
```

## 3. Deploy staging

### 3a. Backend (Strapi)
1. `git checkout security-hardening && git pull`
2. `cd strapi && npm install` (allinea lockfile)
3. `npm run build`
4. `pm2 restart strapi-staging` (o equivalente runner) → al boot, **knex
   esegue le migrazioni pendenti**. Log da osservare:
   ```
   info: Database migration: 202605140001_void_and_stats_columns.js
   ```

### 3b. Frontend
1. `cd vuejs/frontend && npm install`
2. `npm run build:modern && npm run build:legacy`
3. Copia `dist/modern/` e `dist/legacy/` nello slot statico
   (cf. `docs/frontend-legacy-deploy.md` per UA detection / fallback)

### 3c. Backfill ingredients (FASE 3, gia' applicato nel 202605130002)
La migrazione 130002 esegue il backfill da `Element.ingredients` (JSON) verso
`Ingredient` + `ElementIngredient` per ogni owner. **Idempotente**: ri-eseguibile
senza creare duplicati (find-by-name_normalized).

## 4. Smoke checklist staging

| Test | Risultato atteso |
|---|---|
| **Cameriere apre ordine + aggiunge piatto + portata 1 → served** | `OrderItem.served_at` valorizzato; se owner pro: `InventoryMovement` consumption per ogni ingrediente della ricetta |
| **Cameriere annulla item (voided)** | `OrderItem.voided=true`; `RestaurantDailyStat.voided_count += 1`, `voided_revenue_lost += price*qty`; `total_amount` ordine ricalcolato escludendo voided |
| **Bar staff (pro) apre turno → vende bevanda semplice → carico fatto** | `BarShift.report` aggrega servite per Element; al carico fatto `InventoryMovement` consumption per ogni unita |
| **Bar staff (pro) advanced bevanda (Negroni)** | Al carico fatto scarica ml su ogni Ingredient della ricetta `qty_per_serving * served_count` |
| **Owner pro: confirm-depleted ingrediente con residuo** | `recalcUsageAverages` aggiorna `qty_per_serving` con factor clampato [0.5, 2.0] |
| **Alert magazzino**: stock < threshold | `InventoryAlert` creato dopo run cron (4h o `INVENTORY_ALERTS_INTERVAL_MS`); banner header AppLayout solo owner pro |
| **Gating starter**: owner starter → tab Magazzino mostra UpgradePrompt | OK |
| **Gating staff**: pro+bar accede a `/menu-handler?tab=pantry` | 403 (subscription-gate) |

## 5. Deploy produzione

Solo dopo smoke staging green:
1. Snapshot DB Supabase (Settings → Backup → manual).
2. Stessa sequenza di Step 3 con `pm2 restart strapi-production`.
3. Monitoraggio log per 2h:
   - knex migrations applied
   - cron `runAlertScan` parte (log entry ogni `INVENTORY_ALERTS_INTERVAL_MS`)
   - nessuna eccezione `inventory.applyOnServe`.

### Verifica colonne post-deploy (Supabase SQL editor)

```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'order_items' AND column_name IN ('voided','voided_reason','voided_at','served_at'))
    OR (table_name = 'restaurant_daily_stats' AND column_name IN ('voided_count','voided_revenue_lost'))
  )
ORDER BY table_name, column_name;
```
Devono comparire **6 righe**.

## 6. Monitor post-deploy (1-2 settimane)

| Metrica | Soglia warning |
|---|---|
| Errori `inventory.applyOnServe` | > 1/h sostenuto |
| Errori `inventory.commitBarShift` | qualsiasi |
| Alert mail consegnate | > 0/giorno (sanity) |
| Differenza atteso vs stock (recalc factor) | > 50% sistematico (segnala threshold/qty_per_serving da rivedere) |

Log queries utili (Supabase logs):
```sql
-- Ultimi movimenti consumption stranamente grossi (>10x media)
SELECT * FROM inventory_movements
WHERE kind = 'consumption' AND qty_delta < -100
ORDER BY id DESC LIMIT 50;

-- Voided count per giorno
SELECT date, SUM(voided_count) AS voided, SUM(voided_revenue_lost) AS revenue_lost
FROM restaurant_daily_stats
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY date ORDER BY date DESC;
```

## 7. Cleanup JSON legacy (solo dopo monitor OK)

Quando il monitor di 1-2 settimane non rileva regressioni:

1. Verifica che `Element.ingredients` JSON non venga piu' scritto dal codice:
   ```bash
   grep -rn "element\.ingredients\b\|data\.ingredients" strapi/src/ vuejs/frontend/src/
   ```
   Tutti i write devono essere su `ElementIngredient` (relation table).

2. Sanity check sul DB:
   ```sql
   SELECT COUNT(*) FROM element_ingredients; -- deve essere >> 0
   ```

3. Attiva la migrazione di cleanup:
   ```bash
   cd strapi/database/migrations
   mv 202605300001_drop_legacy_element_json.js.disabled 202605300001_drop_legacy_element_json.js
   # in env Strapi:
   export ENABLE_LEGACY_JSON_DROP=true
   ```

4. Deploy + restart Strapi → la migrazione droppa `elements.ingredients` e
   `elements.allergens`. Knex tracker la marca come applicata.

5. **NB**: non droppare prima che il dual-write sia rimosso dal codice
   (altrimenti il prossimo deploy che prova a scrivere il JSON fallirebbe).

## 8. Rollback

### Rollback codice
`pm2 restart` con la commit precedente. Le colonne aggiunte da `202605140001`
restano vuote ma **non rompono niente** (sono opt-in: default false/0).

### Rollback DB
```sql
-- Solo se strettamente necessario (perde audit voided).
ALTER TABLE order_items DROP COLUMN IF EXISTS voided;
ALTER TABLE order_items DROP COLUMN IF EXISTS voided_reason;
ALTER TABLE order_items DROP COLUMN IF EXISTS voided_at;
ALTER TABLE order_items DROP COLUMN IF EXISTS served_at;
ALTER TABLE restaurant_daily_stats DROP COLUMN IF EXISTS voided_count;
ALTER TABLE restaurant_daily_stats DROP COLUMN IF EXISTS voided_revenue_lost;
DROP INDEX IF EXISTS idx_order_items_voided;
```
**NB.** Strapi `knex_migrations` tracker va aggiornato a mano:
```sql
DELETE FROM knex_migrations WHERE name = '202605140001_void_and_stats_columns.js';
```
altrimenti il prossimo boot non riproverebbe la migrazione.
