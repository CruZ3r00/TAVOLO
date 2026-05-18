# Plan — Fix staging authenticated API 500 after deploy (2026-05-18)

## Problema

- Frontend staging risponde 200.
- Login API staging risponde 200.
- API autenticate (`/api/users/me`, `/api/tables`, `/api/orders`) rispondono 500.
- API anonime sugli stessi path rispondono 403 correttamente.

## Ipotesi tecnica

Il middleware `subscription-gate` chiama `resolveStaffContext()` prima dei controller.
Se il contesto staff fallisce per drift schema/DB/relazioni in staging, il middleware
propaga l'errore e trasforma tutta l'API autenticata in 500.

## Checklist

- [x] Rendere `resolveStaffContext()` resiliente: se il refresh completo dell'utente fallisce, usare il payload JWT come fallback.
- [x] Rendere `subscription-gate` resiliente: se la risoluzione staff fallisce, loggare warning e applicare fallback owner invece di 500.
- [x] Verificare sintassi Node.
- [x] Verificare test Strapi.
- [x] Aggiornare lessons con la regola di prevenzione.
- [ ] Attendere deploy prima di rifare qualunque test live/carico.

# Plan — Element.ingredients legacy JSON cleanup (2026-05-14)

## Problema riportato dall'utente

> "Quando aggiungo un nuovo elemento al menu (es. un negroni, settato come bevanda),
> gli ingredienti si salvano ancora come JSON nella tabella principale del menu.
> Le relazioni e gli ingredienti restanti nel database vengono creati correttamente,
> ma il JSON non dovrebbe più esserci. Il nome degli ingredienti dovrebbe essere
> contenuto all'interno della tabella `element_ingredients`, la quale non dovrebbe
> contenere duplicazioni: se inserisco in due piatti diversi lo stesso ingrediente
> (selezionato dai consigli di autocompilazione o via regex per ritrovare lo stesso
> ingrediente) l'ElementIngredient deve essere lo stesso, limitato però agli
> ingredienti dello stesso ristorante (owner del menu, non tra tutti)."

## Lettura del problema (terminologia tecnica)

Il modello normalizzato corretto è già presente nel codebase:

- `Ingredient` (tabella `ingredients`) — dizionario canonico per owner. Chiave logica:
  `(fk_user, name_normalized)`. Contiene `name`, `name_normalized` (lowercase
  trimmato), `unit`, `stock_qty`, `is_unavailable`, ecc.
- `ElementIngredient` (tabella `element_ingredients`) — riga ricetta che collega
  `Element ↔ Ingredient` con `qty_per_serving` (e `unit_override` opzionale).
  Non contiene il nome: il nome vive nell'`Ingredient` referenziato.
- `Element.ingredients` (campo JSON sulla tabella `elements`) — **legacy**.
  Era il vecchio modo di salvare gli ingredienti come array di stringhe.
  Va eliminato.

Quando l'utente dice "il nome degli ingredienti dovrebbe essere contenuto
all'interno della tabella `element_ingredients`" intende in realtà "deve vivere
solo in `ingredients` (riferito da `element_ingredients`) e non più nel JSON
sull'elemento". È quello che faremo.

## Reperti dall'investigazione

### Backend già in posizione
- `element.controller.create/update` chiama `ingredientsService.syncElementRecipe`.
  Quindi gli `ElementIngredient` vengono creati correttamente.
- `findOrCreateIngredient(strapi, ownerId, name)` esegue lookup case-insensitive
  per `(fk_user, name_normalized)` → dedup logica già implementata.
- `batchListElementIngredientNames` viene usato da `menu.list` e `menu.publicMenu`
  per esporre la lista di nomi senza più passare dal JSON (con fallback legacy).
- `MenuAdder.vue` chiama `GET /api/ingredients` per popolare l'autocomplete con
  gli ingredienti di QUEL ristorante (già scoped a `fk_user` dal controller).

### Cosa è rotto
1. **`element.controller`**:
   - `buildElementData` (riga 57-59) scrive ancora `data.ingredients` →
     dual-write JSON sul create/update.
   - `serializeElement` (riga 101) restituisce `element.ingredients` raw dal JSON
     (non dalla relazione `ElementIngredient`). Questo è il motivo per cui il
     campo è ancora visibile.
2. **`menu.controller`**:
   - `serializeElement` (riga 249) fa fallback al JSON.
   - `publicMenu` (riga 413) fa fallback al JSON.
   - `analyzeImport`/`bulkImport`: import OCR scrive ancora `ingredients` come
     campo JSON (riga 550, 639, `sanitizeElement` riga 223).
3. **`ingredients.service`**:
   - `listElementIngredientNames` (riga 235), `backfillLegacyJsonIngredients`
     (riga 296), `setIngredientUnavailable` (riga 447), `listElementRecipe`
     (riga 683): tutti fanno fallback al JSON legacy.
4. **Schema**: `Element.ingredients` ancora `"type": "json", "required": true`.
   Va: prima reso opzionale, dopo backfill rimosso del tutto.
5. **DB**: nessun unique constraint su `(fk_user, name_normalized)` in `ingredients`.
   Conseguenza già visibile: 10+ duplicati per owner=1 (es. "champagne" × 3,
   "vini rosati - rosè wines" × 3) creati dalla race condition in
   `findOrCreateIngredient`.
6. **Seed `src/index.js:653-688`**: scrive `ingredients` come stringhe nel
   JSON; quando lo schema cambia, va riadattato a passare per
   `syncElementRecipe` (oppure rimosso dal seed e gestito post-create).
7. **Frontend `MenuList.vue`**: legge `element.ingredients` per visualizzazione
   (riga 321-323) e per il modale di modifica (riga 137, 192-193). Quando il
   backend smette di esporre il campo legacy ma popola sempre quello derivato
   da relazione, la UI continua a funzionare invariata (il payload `ingredients`
   esiste comunque, solo viene da `batchListElementIngredientNames`). Da
   verificare.
8. **Modale modifica `MenuList.vue:137`**: PUT manda `ingredients: toModify.value.ingredients`
   come array di stringhe → `element.controller.update` → `syncElementRecipe`.
   Già OK lato logica, salvo rimuovere la scrittura JSON.

### Dato attuale (Supabase, owner=1)
- `elements`: 138 totali, 128 con `ingredients` JSON ancora popolato.
- `ingredients`: già contiene record per owner=1 con 10+ duplicati per stesso
  `name_normalized`. Da deduplicare prima di aggiungere il unique constraint.

## Strategia — 5 fasi a basso rischio

Lavoriamo in modo che la UI non si rompa MAI tra una fase e l'altra:
prima rendere la relazione canonica completa, poi smettere di scrivere il JSON,
poi rimuoverlo dallo schema. Ogni fase lascia il sistema in stato consistente.

---

### FASE 1 — Dedup ingredienti esistenti + unique constraint

Obiettivo: rendere `(fk_user, name_normalized)` davvero univoco a livello DB,
così che nessuna race condition possa più creare duplicati. Dopo questo step
la dedup è garantita per legge DB, non solo "best effort" dal codice.

- [ ] **1.1** Migration JS `004_ingredients_dedup_unique.js` (idempotente,
  autoesecuzione su `npm run dev`):
  - Per ogni `(fk_user, name_normalized)` con `COUNT(*) > 1`:
    1. Sceglie il "canonical" `ingredient_id` = MIN(id).
    2. Per ogni duplicato `dup_id`:
       - Aggiorna `element_ingredients_fk_ingredient_lnk` SET `ingredient_id = canonical` WHERE `ingredient_id = dup_id` (gestire conflitti: se la combinazione canonical+ei_id esiste già, eliminare il link duplicato invece di aggiornare).
       - Aggiorna eventuale `inventory_adjustments_fk_ingredient_lnk` (controllare schema).
       - Aggiorna eventuale `inventory_orders_fk_ingredient_lnk` (controllare schema).
       - Aggiorna eventuale `bar_shifts` snapshot se referenziano `ingredient_id` (controllare).
       - Elimina la riga duplicata `DELETE FROM ingredients_fk_user_lnk WHERE ingredient_id = dup_id`, poi `DELETE FROM ingredients WHERE id = dup_id`.
    3. Logga numero merge per audit.
  - Crea `CREATE UNIQUE INDEX IF NOT EXISTS uniq_ingredients_owner_name ON ingredients_fk_user_lnk (user_id, ingredient_id) ... ` — **CORREZIONE**: l'unique non sta sulla lnk table ma sulla coppia logica. Approccio corretto: aggiungere colonna `fk_user_id_denorm INT NULL` su `ingredients` con backfill da `ingredients_fk_user_lnk`, poi UNIQUE INDEX su `(fk_user_id_denorm, name_normalized)`. Alternativa cleaner: UNIQUE INDEX parziale via subquery — non supportato. Va con la colonna denormalizzata + trigger di sync (oppure mantenerla solo per il constraint, dato che Strapi v5 gestisce la lnk).
  - **Decisione architetturale da prendere**: denormalizzare `fk_user_id` su `ingredients` (semplice ma duplica info) o usare `EXCLUDE`/funzione su `pg_constraint` con join. Raccomandato: aggiungere `fk_user_id_denorm` su `ingredients`, popolare al `findOrCreateIngredient`, mettere `UNIQUE (fk_user_id_denorm, name_normalized)`. La denormalizzazione è marginale, l'integrità vale lo scambio.
- [ ] **1.2** Aggiornare `findOrCreateIngredient` a popolare anche `fk_user_id_denorm`.
- [ ] **1.3** Race-safe insert: catch `23505` (unique violation) → ri-lookup. Già fatto best-effort, lo rendiamo definitivo.

**Verifica fase 1:**
- [ ] Re-run query duplicati → 0 righe.
- [ ] Tentativo manuale di insert duplicato in psql → fallisce con `23505`.
- [ ] UI Magazzino (`IngredientsManager.vue`) continua a mostrare lista invariata
  (cardinalità inferiore perché dedup, ma ogni dish del menu deve mappare
  all'ingrediente sopravvissuto).

---

### FASE 2 — Backfill totale Element JSON → ElementIngredient

Obiettivo: garantire che, **prima** di togliere il fallback al JSON, ogni
`Element` con `ingredients` JSON popolato abbia anche le `ElementIngredient`
corrispondenti. Il backfill lazy esiste già (`backfillLegacyJsonIngredients`)
ma è chiamato solo dal flusso `listOwnerIngredientsAggregate` → lo eseguiamo
come migration una tantum su TUTTI gli owner.

- [ ] **2.1** Migration JS `005_backfill_element_ingredients.js`:
  - Query: `SELECT u.id FROM up_users u WHERE EXISTS (SELECT 1 FROM elements_fk_user_lnk e WHERE e.user_id = u.id)`.
  - Per ogni owner, chiama `backfillLegacyJsonIngredients(strapi, ownerId)`.
  - Logga totale element backfillati.
- [ ] **2.2** Verifica: per ogni element con `ingredients` JSON non vuoto,
  esiste almeno una `ElementIngredient` collegata (su almeno una row draft/published).

**Verifica fase 2:**
```sql
SELECT COUNT(*) FROM elements e
WHERE jsonb_array_length(e.ingredients::jsonb) > 0
  AND NOT EXISTS (
    SELECT 1 FROM element_ingredients_fk_element_lnk lnk WHERE lnk.element_id = e.id
  );
-- atteso: 0
```

---

### FASE 3 — Stop alla scrittura del JSON legacy

Obiettivo: nessun nuovo write tocca `Element.ingredients`. Dal momento in cui
quest'app è in linea, ogni create/update lascia il campo `NULL` (o intatto se
già popolato — verrà ripulito alla fase 5).

- [ ] **3.1** `element.controller`:
  - `buildElementData`: rimuovere `data.ingredients = normalizeStringArray(...)`.
    Continuare a **leggere** `raw.ingredients` ma passarlo solo a
    `syncElementRecipe` (variabile separata `desiredIngredientNames`).
  - `create/update`: passare `desiredIngredientNames` direttamente a
    `syncElementRecipe`, non da `parsed.data.ingredients`.
  - `serializeElement`: rimuovere `element.ingredients` dal payload — usare
    `listElementIngredientNames(strapi, element.id)` per popolare. Alternativa:
    chiamare `batchListElementIngredientNames` per evitare N+1 (qui è single
    element, ok pure lookup diretto).
- [ ] **3.2** `menu.controller`:
  - `serializeElement` (riga 249): rimuovere il fallback a `el.ingredients`
    JSON. `recipeMap.get(el.id)` deve essere autoritativo (con `[]` se vuoto).
  - `publicMenu` (riga 413): stesso fix — `recipeMap.get(el.id)` autoritativo.
  - `bulkImport`: dove inserisce/aggiorna Element, non scrivere più `ingredients`
    nei `data`. Chiamare `syncElementRecipe` dopo create per popolare le righe.
- [ ] **3.3** Seed `src/index.js`: post-create, per ogni element seedato,
  chiamare `syncElementRecipe(strapi, user.id, created.id, [...])` con la lista
  hard-coded. Rimuovere `ingredients: [...]` dal payload `data` del create.
- [ ] **3.4** `ingredients.service`:
  - `listElementIngredientNames`: rimuovere il fallback JSON.
  - `setIngredientUnavailable`: rimuovere il ramo fallback JSON (righe 447-452).
  - `listElementRecipe`: rimuovere il fallback legacy JSON (righe 677-697).
  - `backfillLegacyJsonIngredients`: tenerla per ora (verrà eliminata in fase 5).

**Verifica fase 3:**
- [ ] Creare un nuovo Element via UI (es. il "negroni" dell'utente) → ispezionare
  riga `elements` in DB: `ingredients` deve essere `NULL` o `'[]'`. Le righe
  `element_ingredients` + `ingredients` devono essere create deduplicate.
- [ ] Aggiornare un Element esistente: lo stesso, `ingredients` su `elements`
  resta com'era (non viene aggiornato) ma le `ElementIngredient` si sincronizzano.
- [ ] `GET /api/menus` e `GET /api/menus/public/:userDocumentId` continuano a
  rispondere con `ingredients: [...]` nei payload — ma costruito dalla relazione.
- [ ] UI Menu (`MenuList.vue`), UI BeverageList, UI MenuAdder: rendering invariato.
- [ ] UI IngredientsManager: aggiunge un nuovo ingrediente a un piatto → owner
  riusa lo stesso `Ingredient` se già esistente (verificato in DB).

---

### FASE 4 — Backfill cleanup: svuotare il JSON legacy

Obiettivo: visto che ormai nessuno legge più il JSON, e tutto è già
sincronizzato nelle relazioni, possiamo svuotarlo. Non droppiamo la colonna
ancora — lo facciamo in fase 5 dopo soak period.

- [ ] **4.1** Migration JS `006_clear_legacy_element_ingredients.js`:
  - Verifica: per ogni element con `ingredients` JSON non-empty, esiste già
    almeno una `ElementIngredient` (deve essere vero dopo fase 2). Se no, abort.
  - `UPDATE elements SET ingredients = NULL` (oppure `'[]'`). Su tutti.
  - Idempotente: ri-eseguendo è no-op.

**Verifica fase 4:**
```sql
SELECT COUNT(*) FROM elements WHERE ingredients IS NOT NULL AND ingredients::text NOT IN ('null','[]');
-- atteso: 0
```
- [ ] UI completa, nessuna feature menu rotta.

---

### FASE 5 — Drop colonna `Element.ingredients`

Obiettivo: rimuoverla dallo schema Strapi e dalla tabella DB. Dopo questa
fase il dual-write è morto definitivamente.

- [ ] **5.1** Aggiornare `element/content-types/element/schema.json`:
  - Rimuovere il blocco `"ingredients": { "type": "json", "required": true }`.
- [ ] **5.2** Migration JS `007_drop_element_ingredients_json.js`:
  - `ALTER TABLE elements DROP COLUMN IF EXISTS ingredients`.
- [ ] **5.3** Rigenerare types: `npm run build` (Strapi rigenera `types/generated/contentTypes.d.ts`).
- [ ] **5.4** Rimuovere dal service `backfillLegacyJsonIngredients` (non più necessario).
- [ ] **5.5** Code search finale: `grep -rn "element.ingredients\|el.ingredients\|\.ingredients\b"` in `strapi/src` e `vuejs/frontend/src` → solo riferimenti alla relazione/payload API, nessuna referenza alla colonna DB.
- [ ] **5.6** Aggiornare `strapi/CLAUDE.md` (descrizione `Element`): rimuovere
  `ingredients (JSON)`, sostituire con `ingredients via fk_element_ingredients`.
- [ ] **5.7** Aggiornare i test in `strapi/tests/` se ce ne sono che referenziano
  il campo.

**Verifica fase 5:**
- [ ] `\d elements` in psql: nessuna colonna `ingredients`.
- [ ] App funziona end-to-end: creazione, modifica, eliminazione, lista, public menu, OCR import bulk.

---

## Domande/decisioni da confermare con l'utente prima di iniziare

1. **Denormalizzazione `fk_user_id` su `ingredients`** per il unique constraint:
   è marginale (un INT per riga) e semplifica enormemente il vincolo.
   Alternativa: vincolo applicativo + trigger PG. La denormalizzazione è
   raccomandata.
2. **Comportamento su `bulkImport` OCR**: oggi importa Element con
   `ingredients` come stringhe. Confermo che vogliamo che anche l'import
   passi per `syncElementRecipe` (creando/riusando gli `Ingredient` dell'owner).
3. **Backfill mode**: la migration di fase 2 gira automaticamente al primo
   `npm run dev` dopo deploy. È il comportamento desiderato? (Sì, in linea
   con le altre migrations 001-003.)
4. **Timeline**: faccio tutte le 5 fasi in sequenza in questa sessione, oppure
   preferisce step-by-step con verifica visuale fra ognuna?

## Stima

- Fase 1: ~200 righe migration + ~10 righe in `findOrCreateIngredient`.
- Fase 2: ~30 righe migration.
- Fase 3: ~80 righe modificate (3 file backend, 0 frontend).
- Fase 4: ~20 righe migration.
- Fase 5: ~5 righe schema + 10 righe migration + cleanup.

Totale ~350 righe modificate, 4 file backend principali, 4 nuove migration.
Nessuna modifica al frontend (la shape API resta `ingredients: [string]`).

## Note di rollback

Ogni migration è idempotente. Lo schema fino a fase 5 è additivo (aggiunge
colonna denormalizzata, non rompe nulla). Solo la fase 5 è distruttiva —
ma è separata e si esegue solo dopo soak della fase 4.

## Review (2026-05-14)

Tutte le 5 fasi eseguite in sequenza.

### Cambio approccio rispetto al piano originale
- **No denormalizzazione `fk_user_id`** sulla tabella `ingredients` (richiesta utente).
  Univocità imposta via due trigger PostgreSQL `BEFORE INSERT/UPDATE` con
  `pg_advisory_xact_lock` per race-safety. Funzione `enforce_unique_ingredient_per_owner`
  sulla lnk table, `enforce_unique_ingredient_on_rename` sulla tabella `ingredients`
  per gestire i rename.
- **`allergens` lasciato come JSON** (fuori scope, l'utente ha parlato solo di
  ingredients). La migration disabled `202605300001` droppava entrambi: ho
  scritto invece una migration dedicata che tocca solo `ingredients`.
- **OCR NON modificato**, solo il backend bulk importer (richiesta utente).
  L'OCR continua a produrre payload con `ingredients: [string]`; il bulk import
  ora non scrive piu' il JSON ma instrada gli ingredienti tramite `syncElementRecipe`.

### Migration applicate (registrate in `strapi_migrations`)
1. `202605140002_ingredients_dedup_and_unique_trigger.js` — dedup (0 gruppi trovati,
   il backfill precedente li aveva gia' consolidati) + installazione trigger.
2. `202605130002_ingredients_backfill.js` — riapplicata: copre 3 element scoperti
   ("Margherita" x2, "spritz campari") + ha ricreato qualche relazione mancante.
3. `202605140003_drop_legacy_element_ingredients_json.js` — sanity check (0 orphan) +
   DROP NOT NULL + UPDATE NULL + DROP COLUMN `elements.ingredients`.

### Modifiche al codice
- `strapi/src/api/element/content-types/element/schema.json`: rimosso campo `ingredients`.
- `strapi/src/api/element/controllers/element.js`: `buildElementData` non scrive piu'
  `ingredients`; `serializeElement` legge i nomi dalla relazione (lookup tramite
  `ingredientsService.listElementIngredientNames`). `create`/`update` sanitizzano
  la lista ingredienti separatamente e la passano a `syncElementRecipe`.
- `strapi/src/api/menu/controllers/menu.js`: `serializeElement` e `publicMenu`
  non leggono piu' dal JSON, `bulkImport` non scrive piu' il JSON.
- `strapi/src/services/ingredients/index.js`: rimossi 3 fallback al JSON legacy
  (`listElementIngredientNames`, `setIngredientUnavailable`, `listElementRecipe`),
  rimossa colonna `ingredients` da `resolveElementRows`, rimossa funzione
  `backfillLegacyJsonIngredients`. `findOrCreateIngredient` ora gestisce `23505`
  (unique_violation dal trigger) con re-lookup.
- `strapi/src/api/ingredient/controllers/ingredient.js`: rimossa chiamata
  a `backfillLegacyJsonIngredients` in `listAdvanced`.
- `strapi/src/index.js`: seed demo non scrive piu' `ingredients` nel `data` del
  create; chiama `syncElementRecipe` post-create.

### Verifica end-to-end
- Tabella `elements`: la colonna `ingredients` non esiste piu' (verificato
  `information_schema.columns`).
- `ingredients`: 339 righe, 0 duplicati per `(owner, name_normalized)`.
- `element_ingredients`: 718 righe (relazioni di ricetta).
- Trigger `trg_ingredients_unique_owner_link` e `trg_ingredients_unique_on_rename`
  attivi: test manuale conferma `code=23505` su insert duplicato + rollback pulito.
- Negroni dell'utente: ricetta letta correttamente dalla relazione
  `[vermouth, gin, campari]`.
- `GET /api/menus/public/:userDocumentId` → 200, response include `ingredients`
  derivati dalla relazione (3/3 element con ingredienti popolati).
- Strapi log: nessun errore al boot ne' durante le chiamate.

### Cosa fare lato utente
1. Ricaricare il frontend (Ctrl+Shift+R).
2. Provare a creare un nuovo elemento (es. un altro cocktail) con ingredienti
   gia' esistenti in dispensa: l'autocomplete proporra' gli ingredienti
   dell'owner; selezionando un suggerimento, il backend riusa l'`Ingredient`
   esistente (verifica: in DB, `ingredients` totali resta invariato per quel
   nome, mentre nasce solo una nuova `element_ingredient`).
3. Provare a creare due elementi diversi con lo stesso ingrediente: la tabella
   `ingredients` resta a una sola riga per `(owner, name_normalized)`.
