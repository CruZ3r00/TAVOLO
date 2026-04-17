# ADR-0001: Sistema di Prenotazioni

**Stato:** accettato
**Data:** 2026-04-16
**Autore:** Software Architect
**Ambito:** monorepo `cms_restaurant` (Strapi v5 + Vue 3)

---

## 1. Contesto

Il CMS deve abilitare la prenotazione di tavoli da parte dei clienti finali
tramite il sito vetrina esterno (API pubblica) e la gestione delle stesse
da parte del ristoratore nel gestionale. Il modello deve:

- rispettare la capienza massima del ristorante, distinta fra stagione
  estiva (tavoli interni + esterni) e invernale (solo interni);
- prevenire overbooking in presenza di richieste concorrenti (cliente che
  prenota dal sito pubblico mentre il ristoratore inserisce a mano);
- fornire una state machine chiara sul ciclo di vita della prenotazione;
- integrarsi con l'ecosistema esistente (Strapi v5 Document API, users-permissions,
  WebsiteConfig 1:1 con utente, DB Knex su MySQL/Postgres/SQLite);
- essere implementabile in una singola iterazione senza introdurre
  nuove dipendenze infrastrutturali (no Redis, no scheduler esterni in v1).

Content type esistenti rilevanti: `Menu`, `Element`, `WebsiteConfig`
(1:1 user via `fk_user`), `Preference` (deprecato, ignorato).

---

## 2. Decisioni

### ADR-0001.1 — Modello coperti sulla `WebsiteConfig`

**Decisione:** estendere `WebsiteConfig` con due attributi integer
`coperti_invernali` e `coperti_estivi`. Non viene creato un nuovo content
type `restaurant-capacity`.

**Motivazione:**
- `WebsiteConfig` è già in relazione `oneToOne` con `plugin::users-permissions.user`
  e viene creato automaticamente alla registrazione (cfr. `strapi/src/index.js`
  bootstrap + lifecycle users-permissions). I coperti appartengono al
  profilo operativo del ristorante, non hanno ciclo di vita autonomo: non
  esistono casi in cui si voglia una capacità senza sito configurato.
- Evita una join in più su ogni controllo di capacità (percorso caldo
  della prevenzione overbooking).
- Riduce il numero di migrazioni Strapi e di endpoint CRUD aggiuntivi.

**Alternativa scartata:** content type `restaurant-capacity` dedicato.
Giustificato solo se in futuro dovessimo versionare la capacità nel tempo
(es. storicizzazione) o gestire più sale con capienze distinte. In quel
caso si migra (vedi "Evoluzioni future").

**Schema attributi (delta `website-config/schema.json`):**

```json
{
  "coperti_invernali": {
    "type": "integer",
    "required": true,
    "min": 1,
    "max": 10000
  },
  "coperti_estivi": {
    "type": "integer",
    "required": false,
    "min": 1,
    "max": 10000
  }
}
```

**Regola di fallback (enforced lato controller, non a livello di schema):**

- `coperti_invernali` **obbligatorio** in registrazione.
- se `coperti_estivi` non è fornito o è `null`, viene impostato uguale a
  `coperti_invernali` al momento della scrittura (DB valore sempre
  popolato, semplifica la capacity query).
- simmetricamente, se in una `update` parziale arriva solo uno dei due
  campi e l'altro era coerente col precedente valore, NON si tocca
  l'altro (evita override involontari).

**Validazione:** entrambi interi >= 1. Cap superiore a 10.000 come sanity
check (oltre non è un ristorante).

---

### ADR-0001.2 — Stagione estiva/invernale via env

**Decisione (v1):** opzione A — mesi stagione estiva configurati via env
`SUMMER_MONTHS` (CSV di numeri mese 1..12). Default: `4,5,6,7,8,9,10`
(aprile-ottobre incluso).

**Motivazione:**
- Nessuna UI aggiuntiva, nessuna migrazione, nessuna business logic
  di validazione intervalli per ristorante.
- Il requisito reale v1 è "capacità differenziata", non "stagionalità
  multi-tenant". Overengineering evitato.
- Manutenibile: il ristoratore che ha bisogno di cambiare la finestra
  stagionale chiede al gestore dell'istanza; è un cambio raro.

**Opzione B (differita a v2):** campi `summer_start_month` /
`summer_end_month` (o date esplicite) su `WebsiteConfig`. Da introdurre
solo se emergono ristoranti con stagionalità atipiche (montagna/mare).

**Helper condiviso (pseudo-code, da esporre in `strapi/src/utils/season.js`):**

```js
function isSummerSeason(dateISO) {
  const months = (process.env.SUMMER_MONTHS || '4,5,6,7,8,9,10')
    .split(',').map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 12);
  const m = new Date(dateISO).getUTCMonth() + 1; // 1..12
  return months.includes(m);
}

function capacityFor(websiteConfig, dateISO) {
  return isSummerSeason(dateISO)
    ? (websiteConfig.coperti_estivi ?? websiteConfig.coperti_invernali)
    : websiteConfig.coperti_invernali;
}
```

Timezone: la stagione è funzione della data locale del ristorante.
**Nota operativa:** in v1 si usa UTC (stessa del datetime Strapi). Se
il ristorante è Europe/Rome e il booking è al 31 ottobre 23:30 UTC
(=1 novembre locale), il mese UTC è ottobre → stagione estiva.
Accettabile per v1. Documentato come limitazione nota.

---

### ADR-0001.3 — Time slot: durata configurabile, bucket fisso da mezzanotte

**Decisione:** slot **fissi** (non mobili) di durata `RESERVATION_SLOT_MINUTES`
(default `120`). Una prenotazione al datetime `t` appartiene allo slot
`floor((t - midnight_UTC) / slot) * slot`.

**Motivazione — fissi vs mobili:**

| Criterio | Fissi (scelto) | Mobili (finestra ±slot/2) |
|---|---|---|
| Query conflitti | `reservation_slot = X` (indicizzabile) | `datetime BETWEEN t - S AND t + S` (range scan) |
| Semantica utente | "turno 19:00-21:00" chiaro | sfuma, può sembrare disponibile poi non lo è |
| Overbooking edge | zero | possibile se due richieste cadono a cavallo |
| Implementazione | banale | locking range-based complicato |
| UX slot picker | naturale (select di turni) | problematico |

Gli slot mobili brillano solo se si vuole ottimizzare il riempimento
(es. 19:15 OK anche se c'è gente alle 18:30). Per v1 non è un
requisito e peggiora la prevedibilità.

**Pseudo-code del calcolo slot (utility condivisa):**

```js
const SLOT_MS = (parseInt(process.env.RESERVATION_SLOT_MINUTES || '120', 10)) * 60 * 1000;

function slotStartFor(datetimeISO) {
  const t = new Date(datetimeISO).getTime();
  const dayStart = Math.floor(t / 86400000) * 86400000; // mezzanotte UTC del giorno
  const offsetInDay = t - dayStart;
  const bucketOffset = Math.floor(offsetInDay / SLOT_MS) * SLOT_MS;
  return new Date(dayStart + bucketOffset).toISOString();
}

function slotEndFor(datetimeISO) {
  return new Date(new Date(slotStartFor(datetimeISO)).getTime() + SLOT_MS).toISOString();
}
```

**Persistenza:** ogni record `Reservation` memorizza `datetime` (richiesta
esatta del cliente) + `slot_start` (bucket canonico, `datetime` indicizzato,
usato in tutti i conflict check). Ridondanza accettata: `slot_start`
è dedotto ma indicizzato per evitare computazione a query-time e permettere
un indice composito `(fk_user_id, slot_start)`.

**Vincoli aggiuntivi validati in controller:**
- datetime deve essere nel futuro (> `now + 15 min` di grace);
- datetime deve essere allineato a minuti validi (qualsiasi, non forziamo
  l'utente allo slot_start — è il sistema a bucketizzare);
- `guests` (numero coperti richiesti) deve essere `1..50`.

---

### ADR-0001.4 — Concorrenza: transazione Knex + row-level lock

**Decisione:** ogni creazione di `Reservation` che va a consumare capacità
(status `pending` o `confirmed`) è wrappata in
`strapi.db.transaction(async ({ trx }) => { ... })`. All'interno:

1. `SELECT ... FOR UPDATE` sulla/e righe `website-config` dell'utente
   target (lock della "risorsa capacità", invariante immutabile durante
   la transazione).
2. `SELECT SUM(guests) FROM reservations WHERE fk_user_id = ? AND slot_start = ? AND status IN ('pending','confirmed') FOR UPDATE` — somma coperti correnti nello slot, bloccando le righe esistenti.
3. Confronto con `capacityFor(websiteConfig, datetime)`. Se
   `sum + guests > capacity` → errore `OVERBOOKING` (409), rollback.
4. Insert della nuova reservation con `slot_start` precomputato.
5. Commit.

**Isolation level:** **READ COMMITTED** (default MySQL) è sufficiente
perché il `FOR UPDATE` fornisce già la serializzazione sulle righe
critiche. SERIALIZABLE aumenterebbe la contesa senza benefici dato che
tutti i path di scrittura prendono lo stesso lock. Su Postgres: idem,
READ COMMITTED + `FOR UPDATE`.

**SQLite fallback:** SQLite non supporta `FOR UPDATE` riga-per-riga.
Il driver Knex per SQLite serializza già le write via busy-handler, ma
per garantire la semantica usiamo
`await trx.raw('BEGIN IMMEDIATE')` all'inizio della transazione
(acquisisce immediatamente il RESERVED lock DB-wide). Questo degrada
la concorrenza a "una scrittura alla volta" ma SQLite è ambiente dev/
test, non produzione. Tradeoff accettato.

**Detection DB:** utility `strapi.db.dialect.client` (es. `'mysql'`,
`'postgres'`, `'sqlite'`, `'better-sqlite3'`). Wrapper:

```js
async function withReservationLock(trx, { userId, slotStart }) {
  const dialect = strapi.db.connection.client.config.client;
  if (dialect === 'sqlite' || dialect === 'better-sqlite3') {
    // BEGIN IMMEDIATE è già stato emesso all'apertura tx, no-op qui
    return;
  }
  // MySQL / Postgres: lock esplicito delle righe di capacità e slot
  await trx.raw(
    'SELECT id FROM website_configs WHERE fk_user_id = ? FOR UPDATE',
    [userId]
  );
}
```

**Retry policy (deadlock):** MySQL/Postgres possono restituire deadlock
error (MySQL `ER_LOCK_DEADLOCK` 1213 / code `ER_LOCK_DEADLOCK`, Postgres
SQLSTATE `40P01`). Il controller ritenta **max 3 volte** con backoff
esponenziale `50ms, 150ms, 450ms` + jitter ±25%. Se al 3° tentativo
fallisce ancora → 503 `RESERVATION_CONTENTION`. Wrapper:

```js
async function withDeadlockRetry(fn, { max = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < max; attempt += 1) {
    try { return await fn(); }
    catch (err) {
      const code = err.code || err.errno;
      const isDeadlock = code === 'ER_LOCK_DEADLOCK'
        || code === 1213
        || err.code === '40P01'
        || /deadlock/i.test(err.message || '');
      if (!isDeadlock || attempt === max - 1) throw err;
      lastErr = err;
      const base = 50 * Math.pow(3, attempt); // 50,150,450
      const jitter = base * (0.75 + Math.random() * 0.5);
      await new Promise(r => setTimeout(r, jitter));
    }
  }
  throw lastErr;
}
```

**Esempio completo (pseudo-code da seguire nel controller
`strapi/src/api/reservation/controllers/reservation.js`):**

```js
async function createReservationTx({ targetUserId, datetime, guests, customer, createdBy, initialStatus }) {
  return withDeadlockRetry(() => strapi.db.transaction(async ({ trx }) => {
    // (a) Lock capacità ristorante
    const wcRows = await trx('website_configs')
      .where({ fk_user_id: targetUserId })
      .forUpdate()
      .limit(1);
    if (wcRows.length === 0) {
      throw httpError(404, 'RESTAURANT_NOT_FOUND');
    }
    const wc = wcRows[0];
    if (!wc.coperti_invernali) {
      throw httpError(409, 'CAPACITY_NOT_CONFIGURED');
    }

    // (b) Slot e capacità effettiva
    const slotStart = slotStartFor(datetime);
    const capacity = capacityFor(wc, datetime);

    // (c) Lock prenotazioni esistenti dello slot e somma guests attivi
    const existing = await trx('reservations')
      .where({ fk_user_id: targetUserId, slot_start: slotStart })
      .whereIn('status', ['pending', 'confirmed', 'at_restaurant'])
      .forUpdate();
    const currentGuests = existing.reduce((s, r) => s + r.guests, 0);

    // (d) Check overbooking
    if (currentGuests + guests > capacity) {
      throw httpError(409, 'OVERBOOKING', {
        capacity, current: currentGuests, requested: guests,
      });
    }

    // (e) Insert via Document API (nella stessa transazione)
    const created = await strapi.documents('api::reservation.reservation').create({
      data: {
        datetime, slot_start: slotStart, guests,
        customer_name: customer.name, customer_phone: customer.phone,
        customer_email: customer.email ?? null, notes: customer.notes ?? null,
        status: initialStatus,
        fk_user: { connect: [{ id: targetUserId }] },
        created_by: createdBy, // 'owner' | 'public'
      },
      status: 'published',
    });

    return created;
  }));
}
```

Nota: la Document API Strapi v5 rispetta la transazione esterna se
invocata all'interno di `strapi.db.transaction`.
Lo stesso pattern è già in uso in `menu.js` (`bulkImport`).

---

### ADR-0001.5 — State machine prenotazione

**Stati:**
- `pending` (creata da cliente pubblico, in attesa di conferma ristoratore)
- `confirmed` (confermata — creata direttamente dal gestionale oppure promossa da pending)
- `at_restaurant` (cliente arrivato / in sala)
- `completed` (prenotazione chiusa positivamente, terminale)
- `cancelled` (annullata, terminale)

**Transizioni ammesse:**

| Da / A | pending | confirmed | at_restaurant | completed | cancelled |
|---|---|---|---|---|---|
| pending | — | OK | NO | NO | OK |
| confirmed | NO | — | OK | NO | OK |
| at_restaurant | NO | NO | — | OK | NO |
| completed | NO | NO | NO | — | NO |
| cancelled | NO | NO | NO | NO | — |

Terminali: `completed`, `cancelled`.

**Impatto sulla capacità:**
- contano verso la capacità (conflict check): `pending`, `confirmed`,
  `at_restaurant`.
- NON contano: `completed`, `cancelled`.

**Guard function (pseudo-code):**

```js
const TRANSITIONS = {
  pending:       ['confirmed', 'cancelled'],
  confirmed:     ['at_restaurant', 'cancelled'],
  at_restaurant: ['completed'],
  completed:     [],
  cancelled:     [],
};

function assertTransition(fromStatus, toStatus) {
  const allowed = TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw httpError(400, 'INVALID_TRANSITION', {
      from: fromStatus, to: toStatus, allowed,
    });
  }
}
```

**Side effect sulla capacità:** un passaggio `pending|confirmed →
cancelled` libera coperti. Nessuna logica attiva necessaria: la prossima
create ricomputa `SUM(guests)` escludendo i cancellati.

**Completamento automatico (differito a v2):** un job notturno potrebbe
forzare `confirmed → cancelled` se la prenotazione è passata da N ore
senza check-in. V1 lascia la responsabilità al ristoratore (PATCH manuale).

---

### ADR-0001.6 — Contratto API

**Design:** due endpoint di creazione distinti (principio della least
surprise + permission guards chiari), uniformati con lo stile esistente
del progetto (`/api/menus/public/:userDocumentId`, `/api/menus/import/...`).

#### 6.1 `POST /api/reservations` (autenticato)

Creazione da gestionale. Crea SEMPRE con status che il ristoratore
sceglie fra `pending` (ha preso nota al telefono ma non conferma ancora)
o `confirmed` (default).

**Request:**
```json
{
  "datetime": "2026-05-10T20:30:00.000Z",
  "guests": 4,
  "customer": {
    "name": "Mario Rossi",
    "phone": "+39 320 1234567",
    "email": "mario@example.com",
    "notes": "allergia arachidi"
  },
  "status": "confirmed"
}
```

**Response 201:**
```json
{
  "data": {
    "documentId": "abc123...",
    "datetime": "2026-05-10T20:30:00.000Z",
    "slot_start": "2026-05-10T20:00:00.000Z",
    "guests": 4,
    "status": "confirmed",
    "customer": { "name": "Mario Rossi", "phone": "+39 320 1234567", "email": "mario@example.com", "notes": "allergia arachidi" },
    "created_by": "owner",
    "createdAt": "...", "updatedAt": "..."
  }
}
```

**Errori:** `INVALID_PAYLOAD` (400), `CAPACITY_NOT_CONFIGURED` (409),
`OVERBOOKING` (409), `RESERVATION_CONTENTION` (503 dopo retry esauriti).

#### 6.2 `POST /api/reservations/public/:userDocumentId` (auth: false)

Creazione da sito vetrina. Crea SEMPRE con status `pending`. Ignora
ogni `status` eventualmente presente nel body.

**Request:**
```json
{
  "datetime": "2026-05-10T20:30:00.000Z",
  "guests": 2,
  "customer": {
    "name": "Luigi Verdi",
    "phone": "+39 333 0000000",
    "email": "luigi@example.com",
    "notes": ""
  }
}
```

**Response 201:** stesso shape del 6.1, `status: "pending"`,
`created_by: "public"`.

**Errori:** oltre a quelli di 6.1 → `RESTAURANT_NOT_FOUND` (404) se il
`userDocumentId` non esiste.

**Rate limit (v1 pragmatico):** middleware semplice
`x-forwarded-for`-based, 5 richieste / 10 minuti / IP per
`:userDocumentId`. Documentato come best-effort (non anti-bot robusto).

#### 6.3 `GET /api/reservations` (autenticato)

Lista paginata del ristoratore corrente. Sempre filtrato per
`fk_user = ctx.state.user.id` (niente query-injection possibile).

**Query params:**
- `status` — CSV `pending,confirmed,at_restaurant,completed,cancelled`
  (default: tutti tranne `completed` e `cancelled`).
- `from`, `to` — ISO datetime, filtra `datetime` nel range `[from, to)`.
  Default: `from = oggi 00:00 UTC`, nessun `to`.
- `page`, `pageSize` — paginazione Strapi standard (default 1 / 25, cap
  pageSize = 100).
- `sort` — default `datetime:asc`.

**Response 200:**
```json
{
  "data": [ { "documentId": "...", "datetime": "...", "slot_start": "...", "guests": 2, "status": "pending", "customer": {...}, "created_by": "public", "createdAt": "...", "updatedAt": "..." } ],
  "meta": { "pagination": { "page": 1, "pageSize": 25, "total": 42, "pageCount": 2 } }
}
```

#### 6.4 `PATCH /api/reservations/:documentId/status` (autenticato)

**Request:**
```json
{ "status": "confirmed" }
```

**Logica:**
1. Carica la reservation per `documentId`.
2. `NOT_OWNER` (403) se `reservation.fk_user.id !== ctx.state.user.id`.
3. `assertTransition(current, next)` — `INVALID_TRANSITION` (400)
   altrimenti.
4. Update via Document API. Nessuna transazione di capacità necessaria:
   le transizioni non aumentano il carico di capacità (pending → confirmed
   resta contato; confirmed → cancelled libera; cancelled / completed sono
   terminali).

**Edge case pending → confirmed:** poiché `pending` già consumava
capacità, non serve nuovo check. **Decisione esplicita:** NON si ricontrolla
l'overbooking in questo passaggio (il cliente ha già "bloccato" lo slot
al momento della submit pubblica). Se il ristoratore ha nel frattempo
aggiunto a mano prenotazioni oltre capacità, la `pending` viene comunque
promossa — è il ristoratore l'owner della decisione.

**Response 200:** oggetto reservation aggiornato.

#### 6.5 Codici errore standardizzati

| Code | HTTP | Semantica |
|---|---|---|
| `INVALID_PAYLOAD` | 400 | Body malformato, tipi errati, datetime nel passato |
| `INVALID_TRANSITION` | 400 | Passaggio di status non ammesso dalla FSM |
| `NOT_OWNER` | 403 | L'utente autenticato non possiede la risorsa |
| `RESTAURANT_NOT_FOUND` | 404 | `userDocumentId` non esiste (solo public route) |
| `RESERVATION_NOT_FOUND` | 404 | `documentId` della reservation non esiste |
| `OVERBOOKING` | 409 | Capacità dello slot insufficiente per `guests` richiesti |
| `CAPACITY_NOT_CONFIGURED` | 409 | `coperti_invernali` mancante sul ristorante target |
| `RESERVATION_CONTENTION` | 503 | Deadlock DB dopo retry esauriti |

**Formato body errore** (allineato a `menu.js` OCR):

```json
{ "error": { "code": "OVERBOOKING", "message": "Slot non più disponibile per 4 coperti.", "details": { "capacity": 40, "current": 38, "requested": 4 } } }
```

---

### ADR-0001.7 — Registrazione: override del controller users-permissions

**Decisione:** **opzione (a)** — override del controller `auth/register`
via `strapi/src/extensions/users-permissions/strapi-server.js` per
richiedere e persistere `coperti_invernali` (e opzionale `coperti_estivi`)
all'interno della stessa transazione di creazione utente.

**Motivazione:**
- Atomicità: se la creazione del `WebsiteConfig` fallisce, l'utente
  non viene creato. Una chiamata frontend separata lascerebbe stati
  inconsistenti (utente senza capacità configurata).
- La registrazione già oggi crea il `WebsiteConfig` (lifecycle
  `afterCreate` in `strapi/src/index.js`). L'override consolida
  la logica: il lifecycle resta per email/HTML placeholder, mentre
  i dati obbligatori transitano dal body register.
- Una chiamata separata post-register richiederebbe un endpoint custom
  autenticato + handling fallimento (utente senza capacità → loop di
  onboarding forzato). Overkill.

**Shape del body esteso `POST /api/auth/local/register`:**

```json
{
  "username": "...", "email": "...", "password": "...",
  "name": "...", "surname": "...",
  "restaurant_name": "...",
  "coperti_invernali": 40,
  "coperti_estivi": 60
}
```

**Lato server (pseudo-code extension):**

```js
// strapi/src/extensions/users-permissions/strapi-server.js
module.exports = (plugin) => {
  const originalRegister = plugin.controllers.auth.register;
  plugin.controllers.auth.register = async (ctx) => {
    const { coperti_invernali, coperti_estivi, restaurant_name } = ctx.request.body || {};
    const cInv = parseInt(coperti_invernali, 10);
    if (!Number.isFinite(cInv) || cInv < 1 || cInv > 10000) {
      return ctx.badRequest('coperti_invernali obbligatorio (1..10000).');
    }
    let cEst = null;
    if (coperti_estivi != null && coperti_estivi !== '') {
      cEst = parseInt(coperti_estivi, 10);
      if (!Number.isFinite(cEst) || cEst < 1 || cEst > 10000) {
        return ctx.badRequest('coperti_estivi non valido (1..10000).');
      }
    }
    // Stash per lifecycle: preferire trust-boundary via ctx.state invece di rileggere body
    ctx.state._registerCapacity = {
      coperti_invernali: cInv,
      coperti_estivi: cEst ?? cInv,
      restaurant_name: (restaurant_name || '').trim() || null,
    };
    return originalRegister(ctx);
  };
  return plugin;
};
```

E nel lifecycle `afterCreate` (già esistente in `strapi/src/index.js`)
il `WebsiteConfig.create` viene esteso per leggere
`ctx.state._registerCapacity` (via Strapi requestContext) o, in
alternativa più robusta, si sposta la creazione del `WebsiteConfig`
dentro l'override stesso **prima** di chiamare `originalRegister`... no,
dopo: l'utente non esiste ancora prima di `originalRegister`. Pattern
corretto:

1. `originalRegister` crea utente + triggera lifecycle `afterCreate` (che
   legge `strapi.requestContext.get().state._registerCapacity` e crea
   `WebsiteConfig` con i coperti).
2. Se il lifecycle fallisce, l'utente è già committato. Per renderlo
   atomico avvolgiamo l'override in una transazione aggiuntiva:

```js
plugin.controllers.auth.register = async (ctx) => {
  // validazione capacity come sopra
  return strapi.db.transaction(async () => {
    const result = await originalRegister(ctx);
    // se il lifecycle non ha creato WebsiteConfig coerente, lancia
    return result;
  });
};
```

L'atomicità reale si ottiene spostando il `WebsiteConfig.create` dal
lifecycle al controller override, dopo `originalRegister`, nella stessa
transazione. **Scelta raccomandata:** spostare la creazione del
`WebsiteConfig` dal lifecycle al controller override. Il lifecycle
`afterCreate` resta per email + file HTML placeholder (side effect non
critici su cui vogliamo proprio il comportamento "non blocca la
registrazione" — già implementato così).

**Bootstrap seed (`strapi/src/index.js`, funzione `seedDemoData`):**
aggiungere ai dati demo `coperti_invernali: 40, coperti_estivi: 60`
nel `WebsiteConfig.create`.

---

### ADR-0001.8 — Schema content type `Reservation`

**Path:** `strapi/src/api/reservation/content-types/reservation/schema.json`
(collection type, draft&publish disabilitato come gli altri modelli del
progetto).

**Attributi:**

```json
{
  "kind": "collectionType",
  "collectionName": "reservations",
  "info": {
    "singularName": "reservation",
    "pluralName": "reservations",
    "displayName": "Reservation",
    "description": "Prenotazione tavolo del ristorante"
  },
  "options": { "draftAndPublish": false },
  "attributes": {
    "datetime":      { "type": "datetime", "required": true },
    "slot_start":    { "type": "datetime", "required": true },
    "guests":        { "type": "integer", "required": true, "min": 1, "max": 50 },
    "status":        { "type": "enumeration", "enum": ["pending","confirmed","at_restaurant","completed","cancelled"], "default": "pending", "required": true },
    "customer_name": { "type": "string",  "required": true, "maxLength": 150 },
    "customer_phone":{ "type": "string",  "required": true, "maxLength": 40 },
    "customer_email":{ "type": "email",   "required": false },
    "notes":         { "type": "text",    "required": false, "maxLength": 1000 },
    "created_by":    { "type": "enumeration", "enum": ["owner","public"], "required": true, "default": "public" },
    "fk_user":       { "type": "relation", "relation": "manyToOne", "target": "plugin::users-permissions.user" }
  }
}
```

**Indici consigliati (migration Knex manuale — Strapi non li emette
automaticamente per campi non-relation):**

```sql
CREATE INDEX idx_reservations_user_slot ON reservations (fk_user_id, slot_start);
CREATE INDEX idx_reservations_user_status_dt ON reservations (fk_user_id, status, datetime);
```

Il primo serve la query di conflict check (path caldo, con `FOR UPDATE`);
il secondo serve la lista gestionale filtrata.

---

### ADR-0001.9 — Routing e permessi

**File:** `strapi/src/api/reservation/routes/custom-reservation.js`
(stile coerente con `custom-menu.js`).

```js
module.exports = {
  routes: [
    { method: 'POST',  path: '/reservations',                           handler: 'reservation.create',       config: { policies: [], middlewares: [] } },
    { method: 'POST',  path: '/reservations/public/:userDocumentId',    handler: 'reservation.createPublic', config: { auth: false, policies: [], middlewares: ['api::reservation.public-rate-limit'] } },
    { method: 'GET',   path: '/reservations',                           handler: 'reservation.list',         config: { policies: [], middlewares: [] } },
    { method: 'PATCH', path: '/reservations/:documentId/status',        handler: 'reservation.updateStatus', config: { policies: [], middlewares: [] } },
  ],
};
```

**Permessi (bootstrap `grantImportPermissions` esteso):** aggiungere
per il ruolo `authenticated`:

```
api::reservation.reservation.create
api::reservation.reservation.list
api::reservation.reservation.updateStatus
```

`createPublic` ha `auth: false`, non richiede permessi.

---

## 3. Impatto sul codice esistente

### 3.1 Backend (Strapi)

| File | Modifica |
|---|---|
| `strapi/src/api/website-config/content-types/website-config/schema.json` | +2 attributi `coperti_invernali` (required) e `coperti_estivi` |
| `strapi/src/api/reservation/content-types/reservation/schema.json` | **NEW** — schema come in 8 |
| `strapi/src/api/reservation/controllers/reservation.js` | **NEW** — controller con `create`, `createPublic`, `list`, `updateStatus` |
| `strapi/src/api/reservation/routes/custom-reservation.js` | **NEW** — routing |
| `strapi/src/api/reservation/services/reservation.js` | **NEW** — wrapping `createCoreService` (boilerplate Strapi) |
| `strapi/src/api/reservation/middlewares/public-rate-limit.js` | **NEW** — rate limit in-memory IP-based |
| `strapi/src/utils/season.js` | **NEW** — `isSummerSeason`, `capacityFor` |
| `strapi/src/utils/reservation-slot.js` | **NEW** — `slotStartFor`, `slotEndFor` |
| `strapi/src/utils/db-lock.js` | **NEW** — `withDeadlockRetry`, detection dialect |
| `strapi/src/extensions/users-permissions/strapi-server.js` | **NEW** — override `auth.register` per capacity + `WebsiteConfig` atomico |
| `strapi/src/index.js` | `seedDemoData` → aggiungere `coperti_invernali: 40, coperti_estivi: 60` al seed `WebsiteConfig`. `grantImportPermissions` → aggiungere 3 action `reservation`. Lifecycle `afterCreate`: rimuovere la creazione del `WebsiteConfig` (migrata all'override), mantenere HTML placeholder + email. |
| `strapi/.env.example` | aggiungere `SUMMER_MONTHS`, `RESERVATION_SLOT_MINUTES` |

**Migrazione DB:** per utenti esistenti con `WebsiteConfig` senza
`coperti_invernali` (es. seed pre-feature), eseguire in bootstrap una
**backfill one-shot**: se `coperti_invernali IS NULL`, set default
conservativo `30` e log warning. Idempotente, safe da rieseguire.

### 3.2 Frontend (Vue)

| File | Modifica |
|---|---|
| `vuejs/frontend/src/Pages/Auth/Register.vue` | +2 input numerici `coperti_invernali` (required) e `coperti_estivi` (optional, placeholder "= coperti_invernali"). Submit invia i campi nel body register. |
| `vuejs/frontend/src/Pages/Reservations.vue` | **NEW** — lista + filtri + PATCH status (autenticata) |
| `vuejs/frontend/src/components/ReservationList.vue` | **NEW** |
| `vuejs/frontend/src/components/ReservationCreateModal.vue` | **NEW** — creazione manuale da gestionale |
| `vuejs/frontend/src/components/ReservationStatusBadge.vue` | **NEW** — pill con colori per status |
| `vuejs/frontend/src/components/PublicReservationForm.vue` | **NEW** *(scope successivo: sito vetrina)*. In questa iterazione solo l'API è disponibile. |
| `vuejs/frontend/src/router/index.js` | +1 route `/reservations` con `meta.requiresAuth: true` |
| `vuejs/frontend/src/Layouts/AppLayout.vue` | +1 voce navbar "Prenotazioni" (auth-only) |
| `vuejs/frontend/src/utils.js` | +helper `createReservation`, `createPublicReservation`, `listReservations`, `updateReservationStatus` |
| `vuejs/frontend/src/Pages/WebsiteConfig.vue` | +2 campi capacità (read/edit) |

### 3.3 Documentazione

- `CLAUDE.md`: aggiungere sezione "Reservations API" (mirror di
  "Menu Import (OCR) API") con endpoint, error codes, env vars.
- `docs/adr/0001-reservations-system.md` (questo file).

---

## 4. Rischi e vincoli residui

| Rischio | Probabilità | Mitigazione |
|---|---|---|
| Contention su slot popolari (capodanno, san valentino) | media | Retry deadlock + messaggio chiaro `OVERBOOKING` vs `RESERVATION_CONTENTION`. Se emergono hotspot, aggiungere cache TTL 5s sul counter `SUM(guests)` letto dal public form (strettamente lettura-stimata). |
| Sito pubblico spam / bot | alta | Rate limit IP + captcha invisibile (v2). In v1 best-effort. |
| SQLite in locale degrada a serializzazione globale | bassa (solo dev) | Documentato in README. Produzione = MySQL. |
| Timezone edge-case stagione a mezzanotte | bassa | Documentato. V2: timezone per ristorante in `WebsiteConfig`. |
| No-show → slot bloccato | media | V2: job notturno che auto-cancella `confirmed` se datetime < now - 3h senza check-in. |
| Modifica `coperti_invernali` mentre ci sono prenotazioni attive | bassa | Il controllo overbooking è sempre "alla prossima create". Le prenotazioni già accettate restano valide. |

---

## 5. Evoluzioni future (non scope v1)

1. **Capacità multi-sala** → migrazione a `restaurant-capacity` content type con FK a `WebsiteConfig`.
2. **Stagione configurabile per ristorante** → `summer_start_month` / `summer_end_month` su `WebsiteConfig`.
3. **Notifiche email/SMS** al cliente alla conferma/cancellazione (riusando il plugin email già integrato).
4. **Job scheduler** (Strapi cron o BullMQ) per no-show auto-cancel e reminder.
5. **Cache read-through** sullo stato degli slot per il public form (Redis).
6. **Analytics**: occupazione media per slot, tasso cancellazione, ecc. (vista aggregata lato admin).

---

## 6. Conseguenze

**Positive:**
- Zero nuove dipendenze infrastrutturali (Knex transazioni native Strapi v5).
- Prevenzione overbooking robusta (row-lock + retry), coerente con il pattern già in `menu.js`.
- Modello estensibile: state machine isolata, utility stagione/slot riutilizzabili.
- API coerenti con lo stile del progetto (`public/:userDocumentId` già visto in `menu.publicMenu`).

**Negative / costi:**
- Registrazione utente diventa più pesante (3 campi in più richiesti) — mitigato con UX chiara e fallback `coperti_estivi = coperti_invernali`.
- `WebsiteConfig` acquisisce responsabilità "capacità" oltre a "sito vetrina" → accettato per v1, annotato come candidato split in v2.
- Lock-based contention degrada throughput su slot caldi → mitigato con retry e, se necessario, con short-TTL cache in v2.

---

**Fine ADR-0001.**
