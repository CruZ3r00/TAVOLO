# Lessons

## 2026-05-05 — Project Guidance First

- Start every non-trivial task in this repository by reading `CLAUDE.md` and applying its workflow constraints before exploring or editing code.
- Attempt the code-review graph first as requested by project instructions; if unavailable in the current session, state the fallback and proceed with local files.

## 2026-05-05 — Environment Files Are Sensitive

- Do not print `.env` values while debugging. Inspect only variable names or targeted non-secret config code, and avoid broad `grep` output on `.env` files.

## 2026-05-05 — Missing TLS CA Needs A Complete Dev Fallback

- If a DB config references a missing custom CA while `rejectUnauthorized=true`, simply omitting `ca` may still fail with `self-signed certificate in certificate chain`; development fallback must either use a valid CA or explicitly set `rejectUnauthorized=false`, while production should fail loudly.
- Do not infer production hard-fail only from `NODE_ENV` in local Strapi config; local `.env` can carry production-like values. Use an explicit opt-in such as `DATABASE_SSL_FAIL_ON_MISSING_CA=true`.

## 2026-05-05 — Owner Orders Navigation Scope

- When grouping owner navigation under `Ordini`, include only production departments (`cucina`, `bar`, `pizzeria`, `sg`). Keep `sala`, `manager`, `prenotazioni` and `menu` as independent owner sections unless the user explicitly asks to group them too.

## 2026-05-05 — Do Not Treat Visual Checks As Functional Verification

- For interactive UI changes, verify the actual event path: clickable control type, route guard, target route metadata, state watcher/reload path, and runtime/API availability.
- If the runtime is unavailable (`node`/`npm` missing or servers not listening), say exactly which functional checks could not be run instead of presenting static inspection as end-to-end verification.
- When adding small Three.js scenes that must be verified by Playwright canvas pixel checks, set `preserveDrawingBuffer: true` on those focused renderers or the visual scene can render while `gl.readPixels()` still observes an empty presented buffer.
- Keep important landing copy in DOM cards over the canvas; use Three.js as depth/motion support so legacy and reduced-motion fallbacks stay readable.

## 2026-05-14 — Ingredient lifecycle: nascita via ricetta, non standalone

- Il flusso voluto dal prodotto: gli `Ingredient` non vengono creati direttamente dalla scheda magazzino, ma SOLO come ricetta di un elemento del menu (MenuAdder con typeahead + create-on-miss). Il magazzino registra **rifornimenti** (multi-ingrediente, costo totale distribuito proporzionalmente), non ingredienti nuovi.
- Backend pattern: `POST /api/ingredients/restock-batch` accetta `{ items: [{ ingredient_id, qty }], total_cost?, note? }`. Il costo viene splittato come `cost_i = total * qty_i / sum(qty)` su ogni `inventory_movement`.
- **Dedup difensivo** sui listing (`listAdvanced`, `listOwnerIngredientsAggregate`): aggregati per `name_normalized` lato server, perche' duplicati storici (race su `findOrCreateIngredient` o backfill ripetuti) possono ancora esistere in DB.

## 2026-05-14 — `is_beverage` deve allinearsi al routing staff "bar"

- Lo slot bevande del menu (`Element.is_beverage`) e' definito come "stessa logica del routing staff bar": se `restaurant_category_routing` per quella categoria == BAR (per pro), oppure regex `classifyCategory(category) === BAR` come fallback.
- **Auto-classify points**: `element.create/update` + `menu.bulkImport` calcolano il flag via `isBarRoutedCategory(strapi, owner, category)`. Se il client manda `is_beverage` esplicito, vince (manual override).
- **Propagation**: quando `account.updateCategoryRouting` cambia l'assegnazione di una categoria, aggiorna `is_beverage` su tutti gli element di quella categoria per quell'owner.
- **One-shot backfill** sui dati legacy: `database/migrations/202605140001_backfill_is_beverage.js` (idempotente; UPDATE solo se differente).
- **UI split**: `MenuList.vue` filtra `is_beverage !== true`; `BeverageList.vue` filtra `is_beverage === true`. Niente sovrapposizione.

## 2026-05-14 — Strapi v5 draft/published rompe diff su relazioni many-to-one

- Con `draftAndPublish: true` su un content type, ogni documento ha **due righe** in DB (draft + published) con lo stesso `document_id`. Le relazioni che puntano a quel content type tramite link table puntano a UNA delle righe — non al document.
- Conseguenza: `strapi.db.query('api::X').findOne({ where: { documentId } })` o `findMany` con populate restituiscono ambiguamente la riga draft o published; il populate della relazione vede solo i link su QUELLA riga. Calcoli di "diff/exists" tipo `if (existingLinks.length > 0) skip` falliscono → reinserimento → duplicati esponenziali ad ogni run.
- **Pattern corretto** per gestire link a entita drafted: bypass del populate, query diretta sul link table via `strapi.db.connection` (Knex), aggregata per `document_id` cosi' draft+published sono trattati uniformemente. Al create, inserisci il link verso TUTTE le righe del documento.
- **How to apply**: per `Element` (drafted) ↔ `ElementIngredient` (non drafted), usa Knex su `element_ingredients_fk_element_lnk` per leggere/scrivere, evita `strapi.documents().findOne(...)` quando ti servono i link.

## 2026-05-14 — Strapi custom routes need users-permissions grants AND middleware gating

- A new custom controller action (`getRecipe`, `listAdvanced`, ecc.) richiede sia il middleware di gating (`subscription-gate.js`) sia un grant in `up_permissions` per il ruolo `authenticated`. Senza il grant, lo strato users-permissions risponde 403 *prima* che la subscription-gate venga consultata, e il sintomo è che owner Pro non riescono ad usare feature progettate per il loro piano.
- Quando aggiungi una rotta in `strapi/src/api/<x>/routes/<x>.js` senza `auth: false`, aggiungi *sempre* l'action key `api::<api>.<controller>.<method>` all'array `actions` in `grantImportPermissions` dentro `strapi/src/index.js`. Se l'utente è già in produzione, applica anche l'INSERT manuale in `up_permissions` + `up_permissions_role_lnk` perché il bootstrap concede solo al boot.
- Debug pattern: quando il sub-gate non spiega un 403, ispeziona `SELECT p.action FROM up_permissions p JOIN up_permissions_role_lnk l ON l.permission_id=p.id JOIN up_roles r ON r.id=l.role_id WHERE r.type='authenticated'` e confronta con i routes file.

## 2026-05-18 — Match live-test target with user's browser

- Before running operational/realtime tests, verify the target environment the user is watching. If the user is on `staging-app.comfortables.eu`, local `localhost` load tests will not be visible and can create misleading conclusions.
- State the active target explicitly before generating data, then use that same target for API writes and browser observation.

## 2026-05-18 — Auth middleware must fail closed by policy, not by 500

- Middleware that runs before every authenticated API must not let optional staff/context enrichment throw raw errors. Catch enrichment failures, log a warning, and fall back to the safest valid actor context so owner/core APIs do not become global 500s after a deploy drift.
- When staging shows 500 only for authenticated APIs while login succeeds and anonymous requests return 403, check pre-controller auth/subscription middleware before blaming the frontend or realtime.
