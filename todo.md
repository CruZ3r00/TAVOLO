# Plan — Deploy: POST /api/elements 500 su account legacy (2026-05-20)

## Problema

In produzione `POST /api/elements` puo' fallire con:
`Document with id "...", locale "null" not found`. Il DB online sembra avere
stati draft/published Strapi v5 validi, ma il collegamento Document Service
`menu.fk_elements.connect` e' fragile su alcuni account legacy o build non
allineate.

## Checklist

- [x] Non fare push e non scrivere sul DB: analisi locale/read-only.
- [x] Audit schema/dati owner attivi: menu, elementi, link table, vecchia colonna
  `elements.ingredients`.
- [x] Isolare il punto esatto del 500 tra create Element, recipe sync e connect
  Menu-Element.
- [x] Proporre fix elegante e minimale, valido per manual create e bulk/OCR.
- [x] Aggiungere repair idempotente per vecchi utenti con elementi attivi non
  collegati al menu.
- [x] Verificare sintassi/test locali prima di qualsiasi push.
- [x] Documentare risultato e lesson.

## Review

- Root cause probabile: `strapi.documents('api::menu.menu').update(... fk_elements.connect ...)`
  puo' fallire su relazioni draft/published con `Document with id ..., locale
  "null" not found`, mentre le righe fisiche DB sono presenti e linkabili.
- Fix locale: utility unica `menu-element-links` che collega direttamente la
  link table, rispettando la coppia draft->draft e published->published, e
  valorizzando `element_ord` quando la colonna esiste.
- Copertura: usata sia da `POST /api/elements` sia da `menu.bulkImport`, cosi'
  create manuale e import/OCR non divergono.
- Verifica locale: `node --check` sui file modificati, `npm test` Strapi
  passato (39/39), `git diff --check` passato.
- Audit produzione con `strapi/.env.prod`: owner 29, 51, 65 coerenti; owner 1
  ha 8 documenti Element non archiviati, collegati all'owner ma non al menu.
  Gli elementi mancanti sono stati creati il 2026-05-20 durante i tentativi
  falliti: `Salamino Piccante` x4, `mar`, `marg`, `marr`, `mmmm`.
- Conclusione DB: non manca una colonna legacy e non e' un problema abbonamento;
  il create persiste l'elemento, poi fallisce solo il link menu-element.
- Repair locale: migration `202605200002_repair_menu_element_links.js`, one-way
  e conservativa. Non cancella dati, ignora archiviati, ripara solo owner con
  un solo menu document e collega rispettando draft/published.

# Plan — Deploy Strapi: backfill is_beverage fallisce senza colonna (2026-05-19)

## Problema

In deploy Strapi si ferma durante la user migration
`202605140001_backfill_is_beverage.js` perche' la migration legge
`elements.is_beverage` prima che la sincronizzazione schema di Strapi abbia
creato la colonna sul database target.

## Checklist

- [x] Rendere la migration autosufficiente: creare `elements.is_beverage` se manca.
- [x] Aggiungere una nuova migration idempotente per i flag Element usati a runtime.
- [x] Mantenere la migration idempotente su staging/produzione gia' aggiornati.
- [x] Verificare sintassi migration e diff.
- [x] Aggiornare review e lessons se emerge un errore di codice/migration.

## Review

- Root cause: le user migrations Strapi girano durante `db.schema.sync`, prima
  che il diff dei content type garantisca la presenza della nuova colonna.
  La migration di backfill quindi non poteva selezionare `e.is_beverage` su un
  DB target non ancora sincronizzato.
- Fix: la migration bloccante ora crea `elements.is_beverage boolean default
  false` solo se manca, poi esegue il backfill esistente.
- Robustezza: aggiunta `202605190004_element_flag_columns.js` per garantire
  anche `is_beverage_advanced`, `is_archived` e gli indici Element che una
  migration precedente poteva aver saltato quando le colonne mancavano.
- Verifica: `node --check` passato; test Knex in-memory senza colonna iniziale
  passato (`before=false`, `after=true`, `updates=1`); doppia esecuzione della
  migration nuova passata; `npm test` Strapi passato (37 test).

# Plan — Deploy Strapi: cleanup ingredienti legacy senza link table (2026-05-19)

## Problema

Dopo il fix `is_beverage`, Strapi arriva alla migration
`202605140003_drop_legacy_element_ingredients_json.js` e fallisce perche'
interroga `element_ingredients_fk_element_lnk` prima che la link table esista
nel database target.

## Checklist

- [x] Rendere il cleanup legacy fail-soft quando la link table non esiste.
- [x] Preservare il dato legacy `elements.ingredients` se il backfill strutturato
  non puo' essere verificato.
- [ ] Verificare sintassi e deploy restart.

## Review

- Fix: se `element_ingredients_fk_element_lnk` non esiste, la migration fa skip
  del cleanup distruttivo invece di crashare.

# Plan — Mobile turno bar: contenuti modale devono scrollare (2026-05-19)

## Problema

Su mobile nel flusso `Turno bar` il modale `Carico fatto/Riepilogo turno`
blocca lo scroll del body e rende scrollabile solo la sezione centrale. Header,
azioni e testi di supporto restano fermi, riducendo lo spazio utile e rendendo
difficile leggere esempio/consigli/nota.

## Checklist

- [x] Rendere lo scroll mobile dell'intero modale, non solo del body interno.
- [x] Conservare il layout desktop/tablet con header/footer stabili.
- [x] Verificare sintassi/build frontend.
- [x] Aggiornare lessons con la regola mobile.

## Review

- Su mobile (`<=640px`) `.cf-overlay` diventa lo scroll container e `.cf-body`
  torna a overflow visibile: header, testi, esempio/nota e azioni scorrono
  insieme.
- Desktop/tablet resta invariato: card a flex column con body interno
  scrollabile e footer stabile.
- Verifica: `npm run build:modern` e `git diff --check` passati. `node --check`
  non e' applicabile ai file `.vue`.

# Plan — Essential nav: solo Ordini e Carico bar (2026-05-19)

## Problema

Nell'account staff del piano Essenziale compaiono sia `Ordini` sia `Cucina SG`.
Dato che in Essenziale tutta la produzione arriva nella coda unica `Ordini`,
`Cucina SG` e' un duplicato inutile e puo' portare a una vista vuota/confusa.

## Checklist

- [x] Nascondere `Cucina SG` dalla navigazione staff `cucina` Essential.
- [x] Lasciare visibili solo `Ordini` e `Carico bar` per lo staff ordini
  Essential.
- [x] Bloccare accesso diretto alle route reparto Pro per account non-Pro.
- [x] Verificare build frontend e diff.

## Review

- `canSeeNavItem()` ora per staff `cucina` mostra `cucina`, `bar-management`
  e `logout`: quindi in Essential restano `Ordini` e `Carico bar`.
- Le route `/bar`, `/pizzeria` e `/kitchen-sg` hanno `requiresPlan: 'pro'`;
  `/kitchen-sg` non accetta piu' il ruolo tecnico `cucina`.
- `canAccessRoute()` blocca le route Pro se `subscription_plan !== 'pro'`.
- Verifica: `node --check` su `staffAccess.js` e `router/index.js`,
  `npm run build:modern`, `git diff --check` passati.

# Plan — Essential Ordini deve mostrare tutte le categorie (2026-05-19)

## Problema

Nel piano Essenziale l'owner vede le comande nella scheda `Tutti`, ma la
scheda `Ordini` e l'account tecnico cucina/ordini non vedono gli item che la
tabella routing classifica come `bar`. Il frontend etichetta correttamente
`cucina` come coda unica `Ordini`, ma il filtro SQL dei reparti continua a
usare `restaurant_category_routing.staff_role`.

## Checklist

- [x] Correggere solo il filtro backend Essential: `cucina/Ordini` include
  tutti gli item non serviti.
- [x] Lasciare invariato il piano Pro: reparti separati e filtro per categoria.
- [x] Eseguire micro-test/sintassi e test backend mirati.
- [x] Documentare risultato e lesson.

## Review

- Root cause: `loadRoutingMap()` gia' trattava Essential come coda unica
  `cucina`, ma `listOrderIdsForStation()` filtrava prima in SQL su
  `restaurant_category_routing.staff_role`. Le categorie bevande restavano
  quindi escluse dalla vista reparto `Ordini`.
- Fix: se l'owner non ha routing Professionale attivo e la station richiesta e'
  `cucina`, la query reparto include tutti gli item non serviti; se un non-Pro
  chiede altre station, ritorna vuoto. In Pro resta il join su routing.
- Verifica: `node --check src/api/order/controllers/order.js`, `npm test`,
  `git diff --check` passati.

# Plan — Mail accessi non visibile in staging (2026-05-19)

## Problema

Il provider mostra ancora la vecchia notifica interna
`Nuovo ristoratore registrato` inviata a `support@comfortables.eu`, mentre la
mail accessi al titolare non compare. Inoltre i campi pending erano stati
aggiunti in una migration gia' usata, quindi staging poteva non riceverli.

## Checklist

- [x] Confermare che la vecchia notifica interna non esiste piu' nel codice.
- [x] Creare una nuova migration idempotente per i campi provisioning signup.
- [x] Aggiungere log diagnostici per ogni motivo di skip/invio della mail accessi.
- [x] Verificare sintassi, test Strapi e diff.

## Review

- `rg` non trova piu' `Nuovo ristoratore` o `NEW_USER_NOTIFICATION_EMAIL` in
  `strapi/src`: dopo deploy non deve piu' partire la mail interna a support.
- Aggiunta `202605190003_signup_provisioning_fields.js` per garantire i campi
  pending anche su DB dove la migration precedente e' gia' registrata.
- Log attesi: `staff access email: invio a ...` prima dell'invio e
  `Email accessi staff inviata a ...` dopo successo; se viene saltata, ora il
  log dice se mancano owner/email/piano/subscription/staff.
- Verifica: `node --check`, `npm test`, `git diff --check` passati.

# Plan — Side effect signup solo dopo pagamento (2026-05-19)

## Problema

La registrazione stava ancora creando configurazione/sito prima del pagamento,
mentre la mail accessi staff partiva dopo Stripe. Questo produceva stati
intermedi confusi: account esistente senza pagamento, niente mail, sessione non
riallineata.

## Checklist

- [x] Registrazione: solo validazione e salvataggio dati pending per provisioning.
- [x] Post-pagamento: creare WebsiteConfig, sito placeholder, staff account e mail.
- [x] Dopo pagamento: logout tecnico e redirect a `/login` per sessione pulita.
- [x] Verificare sintassi, test backend e build frontend.

## Review

- Rimosso il lifecycle `afterCreate` che generava sito/email alla registrazione.
- I dati ristorante necessari al provisioning sono salvati su owner come campi
  pending privati e consumati dopo pagamento.
- `syncStaffAndSendAccessEmail` ora prima fa provisioning post-pagamento, poi
  sincronizza staff e invia la mail accessi.
- Dopo `sync-checkout` riuscito, il frontend chiama logout e manda a `/login`.
- Verifica: `node --check src/index.js`, `node --check src/api/billing/controllers/billing.js`,
  `npm test`, `npm run build:modern`, `git diff --check` passati.

# Plan — Signup Stripe abort non deve lasciare account bloccante (2026-05-19)

## Problema

Se l'utente apre Stripe e torna indietro senza pagare, resta un account owner
senza subscription attiva. Al secondo tentativo la registrazione fallisce con
`email or username already taken` e il router lo porta su `/renew-sub`.

## Checklist

- [x] Aggiungere cleanup sicuro dell'owner pending non pagato su checkout annullato.
- [x] Gestire i pending storici: secondo tentativo con stesse credenziali riapre Checkout invece di fallire.
- [x] Evitare redirect confuso a `/renew-sub` dopo back da Stripe senza pagamento.
- [x] Verificare build frontend e test Strapi.

## Review

- Nuovo endpoint autenticato `POST /api/billing/abandon-signup`: elimina solo
  owner senza subscription attiva e senza `stripe_subscription_id`, poi pulisce
  cookie auth.
- Se Stripe ritorna `checkout=cancelled` per un signup non pagato, il frontend
  chiama il cleanup, svuota la sessione locale e torna a `/register`.
- Se esiste gia' un owner pending storico, ChoosePlan prova il login con le
  stesse credenziali e riapre Checkout invece di mostrare `email or username
  already taken`.
- Verifica: `node --check src/api/billing/controllers/billing.js`,
  `npm test`, `npm run build:modern`, `git diff --check` passati.


# Plan — Email accessi staff post-attivazione piano (2026-05-19)

## Obiettivo

Quando Stripe attiva il piano, inviare al titolare una mail semplice con gli
account inclusi nel piano scelto. La mail non deve contenere password: deve
dire che la password e' la stessa usata in registrazione e che potra' essere
cambiata piu' avanti.

## Checklist

- [x] Preparare template testo/html per Essenziale e Professionale.
- [x] Inviare la mail solo dopo subscription attiva e sync staff completato.
- [x] Evitare invii duplicati tra return da Stripe e webhook.
- [x] Verificare test Strapi.

## Review

- La mail parte da `billing` dopo checkout sync/webhook/cambio piano, quindi
  solo quando la subscription e' attiva e gli account staff sono sincronizzati.
- Essenziale invia `Sala` e `Ordini`; Professionale invia `Sala`, `Cucina`,
  `Bar`, `Pizzeria`, `Cucina SG`.
- La mail contiene solo username e specifica che la password e' quella scelta
  in registrazione.
- Aggiunti `staff_access_email_sent_at` e `staff_access_email_sent_plan` per
  evitare duplicati tra webhook Stripe e ritorno frontend.
- Verifica: `node --check src/api/billing/controllers/billing.js`,
  `npm test`, `git diff --check` passati.


# Plan — Essenziale: coda unica "Ordini" invece di "Cucina" (2026-05-19)

## Obiettivo

Per il piano Essenziale non cambiare login/ruoli tecnici: lo staff continua a
usare il ruolo `cucina`, ma l'esperienza utente deve presentarlo come coda unica
`Ordini`. Questo evita che un locale beverage-only pensi che gli ordini bar
finiscano in una cucina inesistente.

## Checklist

- [x] Confermare che il routing backend Essenziale mandi tutte le categorie al
  ruolo tecnico `cucina`.
- [x] Rinominare le label visibili da `Cucina` a `Ordini` solo quando il piano
  utente e' `starter`.
- [x] Lasciare invariato il piano Professionale: reparti separati Cucina, Bar,
  Pizzeria, Cucina SG.
- [x] Eseguire un micro test/build mirato dopo la patch.

## Review

- Routing invariato: su Essenziale `stationForCategory` continua a restituire
  il ruolo tecnico `cucina` per tutte le categorie; su Professionale resta lo
  smistamento per reparti.
- Frontend: navigazione desktop/mobile, pagina comande, profilo reparti e
  stampanti mostrano `Ordini` per il reparto unico Essenziale.
- Backend: `/account/staff` e `/billing/status` restituiscono label `Ordini`
  per `cucina` solo quando il piano owner e' `starter`.
- Verifica: `npm run build:modern`, `npm test`, `git diff --check` passati.

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

# Plan — Fix staging login/register secure-cookie failure (2026-05-19)

## Problema

- In staging la registrazione crea l'utente e il sito placeholder, poi risponde:
  `Registrazione annullata: impossibile configurare la capacità del ristorante`.
- I log mostrano la vera causa:
  `Cannot send secure cookie over unencrypted connection`.
- Il frontend vede un errore di capacità perché il middleware di registrazione
  include `setAuthCookies()` nello stesso `try/catch` della `WebsiteConfig` e
  quindi fa rollback anche quando fallisce solo il cookie.

## Ipotesi tecnica

Strapi gira dietro reverse proxy HTTPS -> HTTP. In produzione i cookie auth sono
`secure`, ma Koa non sta fidandosi di `X-Forwarded-Proto: https`, quindi considera
la request non sicura e rifiuta il cookie.

## Checklist

- [x] Configurare Koa proxy trust via `TRUST_PROXY=true`.
- [x] Rendere il post-register robusto: un errore cookie non deve rollbackare
  utente e `WebsiteConfig`.
- [x] Verificare sintassi/test Strapi mirati.
- [x] Aggiornare `lessons.md` con la diagnosi.
- [x] Documentare risultato e nota deploy.

## Review

- Root cause: cookie auth `secure` scritto su request vista da Koa come HTTP
  dietro reverse proxy. Questo rompe login e registrazione cookie-only.
- Fix codice: `strapi/config/server.js` abilita `server.proxy.koa` da
  `TRUST_PROXY`; `strapi/src/index.js` non fa piu' rollback di user/config se
  fallisce solo il cookie post-register.
- Verifica: `cd strapi && npm test` passa con 37/37 test.
- Deploy: staging deve avere `TRUST_PROXY=true` e Nginx deve inviare
  `X-Forwarded-Proto https`.

# Plan — Fix landing legacy search, staff rollback, checkout redirect (2026-05-19)

## Problema

- Nel build legacy della landing compare la ricerca interna del gestionale.
- Se una registrazione fallisce, possono restare account staff sintetici creati
  dal trigger DB su `up_users`.
- Dopo registrazione/verifica, il piano Essenziale finisce su `/renew-sub`
  invece di aprire Stripe Checkout.

## Checklist

- [x] Rimuovere `CommandPalette` dal layout pubblico; resta solo nel layout app.
- [x] Evitare la creazione staff finche' l'owner non ha una subscription attiva.
- [x] Pulire gli staff sintetici durante rollback registrazione.
- [x] Sostituire i redirect post-login/post-2FA a `/renew-sub` con Stripe Checkout diretto.
- [x] Eseguire test Strapi e build frontend modern/legacy.
- [x] Verificare runtime landing legacy senza ricerca interna.
- [x] Documentare risultato.

## Review

- Landing legacy: verificata su `http://127.0.0.1:5175/landing`, nessun
  `.app-top-search`, `.cp-backdrop` o `.cp-panel` nel DOM pubblico.
- Staff: nuova migration rende `sync_owner_staff_accounts` no-op creativo senza
  subscription attiva e ripulisce staff sintetici orfani; il rollback registrazione
  pulisce anche gli staff generati prima di cancellare l'owner.
- Checkout: scelta piano, login post-verifica e 2FA usano Stripe Checkout diretto
  per `starter`/`pro`; niente redirect a `/renew-sub` come fallback signup.
- Verifica: `cd strapi && npm test`, `npm run build:modern`, `npm run build:legacy`.

## Pro Check

- Frontend: `pro` usa lo stesso percorso corretto di `starter` (`createBillingCheckoutSession(planKey)`) sia da scelta piano sia dopo login/2FA con piano pendente. Non ci sono piu' redirect signup a `/renew-sub?plan=...`.
- Backend billing: `PLAN_CONFIG.pro` punta a `STRIPE_PRICE_PRO`; i controlli produzione richiedono `STRIPE_PRICE_STARTER` e `STRIPE_PRICE_PRO` distinti.
- Staff DB: con subscription `pro` attiva, la nuova `sync_owner_staff_accounts` crea/abilita `cameriere`, `cucina`, `bar`, `pizzeria`, `cucina_sg`; senza subscription attiva non crea staff.
- Gating: il middleware permette i reparti pro quando l'owner ha `subscription_plan='pro'` e subscription attiva; su starter restano ammessi solo sala/cucina.

## CSRF Follow-up

- Problema: checkout post-register cookie-only puo' inviare `/api/billing/checkout`
  prima di riuscire a leggere il cookie `ct_csrf`, causando
  `CSRF_TOKEN_INVALID`.
- Fix: Strapi espone `X-CSRF-Token` in CORS; il wrapper fetch frontend memorizza
  quel token e lo usa come fallback su richieste unsafe.
- Verifica: `cd strapi && npm test`, `npm run build:modern`.

## Stripe Return Follow-up

- Problema: durante signup cookie-only, `/api/users/me` risponde 402 prima della
  subscription attiva e `refreshSession` faceva logout locale. Al ritorno Stripe
  `/renew-sub?checkout=success&session_id=...` non chiamava `sync-checkout`
  perche' richiedeva un bearer token.
- Fix: 402 su `/users/me` conserva la sessione locale se esiste un user; `RenewSub`
  sincronizza `session_id`, billing status, checkout e portale anche con cookie auth
  senza token JWT.
- Verifica: `npm run build:modern`.

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
