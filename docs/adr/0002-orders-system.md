# ADR-0002: Sistema di Ordinazioni (Orders)

**Stato:** accettato
**Data:** 2026-04-17
**Autore:** Software Architect
**Ambito:** monorepo `cms_restaurant` (Strapi v5 + Vue 3)

---

## 1. Contesto

Il CMS deve abilitare la gestione degli ordini in sala da parte del
ristoratore. Il cameriere apre un ordine su un tavolo, aggiunge piatti dal
menu (o fuori menu), la cucina li vede e li lavora, il cameriere li serve e
chiude il conto. Il modello deve:

- gestire **tavoli** come entità con stato derivato;
- garantire **un solo ordine attivo per tavolo**;
- implementare una **state machine rigorosa** sugli item (taken -> preparing -> ready -> served);
- calcolare il **totale derivato** server-side (mai inviato dal client);
- astrarre il **pagamento** con strategy pattern (simulator, POS, cassa fiscale);
- gestire la **concorrenza** con optimistic locking + transazioni (stessi pattern di ADR-0001);
- **non toccare** reservation, website-config, ocr-service;
- integrarsi con l'ecosistema esistente (Strapi v5 Document API, users-permissions, Knex).

Content type esistenti rilevanti: `Menu`, `Element` (menu items), `WebsiteConfig`
(1:1 user via `fk_user`), `Reservation` (non toccare).

---

## 2. Decisioni

### ADR-0002.1 -- Content type `Table`

**Decisione:** creare un nuovo content type `api::table.table` per
rappresentare i tavoli del ristorante.

Il modello `Reservation` non ha un campo `table` -- gestisce solo
`number_of_people`. Il concetto "tavolo" come entità NON esiste nel codice
attuale. Lo creiamo ex novo senza toccare `Reservation`.

**Schema `strapi/src/api/table/content-types/table/schema.json`:**

```json
{
  "kind": "collectionType",
  "collectionName": "tables",
  "info": {
    "singularName": "table",
    "pluralName": "tables",
    "displayName": "Table",
    "description": "Tavolo del ristorante"
  },
  "options": { "draftAndPublish": false },
  "attributes": {
    "number": {
      "type": "integer",
      "required": true,
      "min": 1
    },
    "seats": {
      "type": "integer",
      "required": true,
      "min": 1,
      "max": 100
    },
    "area": {
      "type": "enumeration",
      "enum": ["interno", "esterno"],
      "default": "interno",
      "required": false
    },
    "status": {
      "type": "enumeration",
      "enum": ["free", "occupied", "reserved"],
      "default": "free",
      "required": true
    },
    "fk_user": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "plugin::users-permissions.user"
    }
  }
}
```

**Vincolo unicita:** `(number, fk_user)` -- un ristorante non puo avere due
tavoli con lo stesso numero. Enforced a livello applicativo nel controller
(check in transazione prima di insert). Indice DB consigliato:

```sql
CREATE UNIQUE INDEX idx_tables_user_number ON tables (fk_user_id, number);
```

**Campo `status`:** e calcolabile/derivato (un tavolo e `occupied` se ha un
ordine `active`, `free` altrimenti) ma lo manteniamo come campo denormalizzato
per semplicita di query. Aggiornato atomicamente:
- `free -> occupied` quando si apre un ordine
- `occupied -> free` quando si chiude un ordine
- `reserved` non usato in v1 (predisposto per integrazione futura con reservation)

---

### ADR-0002.2 -- Content type `Order`

**Schema `strapi/src/api/order/content-types/order/schema.json`:**

```json
{
  "kind": "collectionType",
  "collectionName": "orders",
  "info": {
    "singularName": "order",
    "pluralName": "orders",
    "displayName": "Order",
    "description": "Ordine in sala"
  },
  "options": { "draftAndPublish": false },
  "attributes": {
    "status": {
      "type": "enumeration",
      "enum": ["active", "closed"],
      "default": "active",
      "required": true
    },
    "opened_at": {
      "type": "datetime",
      "required": true
    },
    "closed_at": {
      "type": "datetime",
      "required": false
    },
    "total_amount": {
      "type": "decimal",
      "default": 0,
      "required": true
    },
    "payment_status": {
      "type": "enumeration",
      "enum": ["unpaid", "paid"],
      "default": "unpaid",
      "required": true
    },
    "payment_reference": {
      "type": "string",
      "required": false,
      "maxLength": 255
    },
    "lock_version": {
      "type": "integer",
      "default": 0,
      "required": true
    },
    "covers": {
      "type": "integer",
      "required": false,
      "min": 1,
      "max": 1000
    },
    "fk_table": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::table.table"
    },
    "fk_user": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "plugin::users-permissions.user"
    },
    "fk_items": {
      "type": "relation",
      "relation": "oneToMany",
      "target": "api::order-item.order-item",
      "mappedBy": "fk_order"
    }
  }
}
```

**Invariante critico:** un solo ordine `active` per tavolo per ristorante alla
volta. Enforced con check in transazione + `SELECT ... FOR UPDATE`.

**`lock_version`:** optimistic locking. Il client invia `lock_version` nel body
o header `If-Match`. Il server rifiuta con 409 `STALE_ORDER` se il valore non
corrisponde. Incrementato a ogni mutation (add/update/delete item, change
status). Previene sovrascritture concorrenti cameriere-cucina.

**`covers`:** numero di coperti dell'ordine (opzionale). Non legato alla
capienza (coperti_invernali/estivi sono per le prenotazioni, non per gli
ordini). Puo differire da `table.seats`.

**`total_amount`:** sempre derivato dal server. Ricalcolato a ogni modifica
degli items. Mai accettato dal client. Formula:
`SUM(order_item.price * order_item.quantity)`.

---

### ADR-0002.3 -- Content type `OrderItem`

**Schema `strapi/src/api/order-item/content-types/order-item/schema.json`:**

```json
{
  "kind": "collectionType",
  "collectionName": "order_items",
  "info": {
    "singularName": "order-item",
    "pluralName": "order-items",
    "displayName": "OrderItem",
    "description": "Elemento di un ordine"
  },
  "options": { "draftAndPublish": false },
  "attributes": {
    "name": {
      "type": "string",
      "required": true,
      "maxLength": 200
    },
    "price": {
      "type": "decimal",
      "required": true,
      "min": 0
    },
    "quantity": {
      "type": "integer",
      "required": true,
      "min": 1,
      "default": 1
    },
    "notes": {
      "type": "text",
      "required": false,
      "maxLength": 500
    },
    "status": {
      "type": "enumeration",
      "enum": ["taken", "preparing", "ready", "served"],
      "default": "taken",
      "required": true
    },
    "fk_order": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::order.order",
      "inversedBy": "fk_items"
    },
    "fk_element": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::element.element"
    }
  }
}
```

**Snapshot semantics:** `name` e `price` sono snapshot al momento dell'aggiunta.
Se il prezzo del menu cambia dopo, gli item gia inseriti mantengono il prezzo
originale. `fk_element` e un riferimento opzionale per tracciabilita.

---

### ADR-0002.4 -- State machine item

```
taken --> preparing --> ready --> served
```

Nessuna transizione laterale o indietro. Transizioni ammesse:

| Da | A ammessi |
|----|-----------|
| taken | preparing |
| preparing | ready |
| ready | served |
| served | (terminale) |

**Cancellazione item:** consentita SOLO se `item.status === 'taken'` E
`order.status === 'active'`. Un item in `preparing` o oltre non e cancellabile
(e gia in lavorazione in cucina).

**Modifica item (quantity/notes):** consentita SOLO se `item.status === 'taken'`
E `order.status === 'active'`.

**Guard function:**

```js
const ITEM_TRANSITIONS = {
  taken:     ['preparing'],
  preparing: ['ready'],
  ready:     ['served'],
  served:    [],
};

function assertItemTransition(from, to) {
  const allowed = ITEM_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw appError('INVALID_ITEM_TRANSITION',
      `Transizione item non ammessa: ${from} -> ${to}.`,
      { from, to, allowed });
  }
}
```

---

### ADR-0002.5 -- State machine order

```
active --> closed
```

Un ordine puo essere chiuso solo se:
1. Status corrente e `active`
2. Il pagamento va a buon fine (via payment_service)

**Chiusura ordine (flow):**

1. Ricalcola totale definitivo da items
2. Invoca `paymentService.charge({ amount, currency, orderId, method })`
3. Se pagamento OK:
   - `order.status = 'closed'`
   - `order.closed_at = now`
   - `order.payment_status = 'paid'`
   - `order.payment_reference = transactionId`
   - `order.lock_version += 1`
4. Aggiorna `table.status = 'free'`
5. Commit transazione

Se il pagamento fallisce: rollback, ordine resta `active`, errore al client.

---

### ADR-0002.6 -- Calcolo conto (order-total service)

**Path:** `strapi/src/utils/order-total.js`

```js
function computeTotal({ items, taxRate, discounts }) {
  const subtotal = items.reduce((sum, item) => {
    return sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity, 10) || 0);
  }, 0);

  const tax = taxRate ? Math.round(subtotal * taxRate * 100) / 100 : 0;
  const discount = discounts
    ? discounts.reduce((sum, d) => sum + (d.amount || 0), 0)
    : 0;

  const total = Math.round((subtotal + tax - discount) * 100) / 100;

  return { subtotal, tax, discount, total };
}
```

**v1:** `taxRate = 0`, `discounts = []`, quindi `total === subtotal`.
**Design-ready** per IVA/sconti in v2.

**Trigger ricalcolo:** ogni add/update/delete item chiama `recalculateTotal(orderId)`
che:
1. Legge tutti gli items dell'ordine
2. Chiama `computeTotal({ items })`
3. Persiste `order.total_amount = total`
4. Incrementa `order.lock_version`

---

### ADR-0002.7 -- Payment service (strategy pattern)

**Path:** `strapi/src/services/payment/`

```
strapi/src/services/payment/
  index.js              -- registry/factory + charge()
  strategies/
    simulator.js        -- default, simulazione locale
    pos.js              -- stub POS fisico
    fiscal-register.js  -- stub cassa fiscale
```

**Interfaccia:**

```js
// index.js
const strategies = { simulator, pos, fiscal_register };

async function charge({ amount, currency, orderId, method, metadata }) {
  const strategyName = method || process.env.PAYMENT_STRATEGY || 'simulator';
  const strategy = strategies[strategyName];
  if (!strategy) throw paymentError('PAYMENT_UNAVAILABLE', `Strategy "${strategyName}" non disponibile.`);
  return strategy.charge({ amount, currency, orderId, metadata });
}
```

**Simulator (`strategies/simulator.js`):**

```js
async function charge({ amount, currency, orderId, metadata }) {
  const latency = parseInt(process.env.PAYMENT_SIMULATOR_LATENCY_MS || '200', 10);
  const failureRate = parseFloat(process.env.PAYMENT_SIMULATOR_FAILURE_RATE || '0');

  await new Promise(r => setTimeout(r, latency));

  if (failureRate > 0 && Math.random() < failureRate) {
    throw paymentError('PAYMENT_DECLINED', 'Pagamento simulato rifiutato.');
  }

  return {
    success: true,
    transactionId: `SIM-${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    amount,
    currency: currency || 'EUR',
  };
}
```

**POS e Fiscal Register:** stub con `throw new Error('NotImplementedError: POS strategy non ancora implementata.')`.
Documentati con TODO inline per futura integrazione.

**Error codes pagamento:**

| Code | HTTP | Semantica |
|------|------|-----------|
| `PAYMENT_DECLINED` | 402 | Pagamento rifiutato dal provider |
| `PAYMENT_TIMEOUT` | 504 | Timeout comunicazione con provider |
| `PAYMENT_UNAVAILABLE` | 503 | Strategy non disponibile/configurata |

---

### ADR-0002.8 -- Concorrenza

**Identico al pattern ADR-0001.4** con le seguenti specificita:

1. **Apertura ordine:** `strapi.db.transaction` + `SELECT ... FOR UPDATE` su
   `tables` (verifica status `free`) + check "no ordine active su quel tavolo"
   sulle righe `orders`. SQLite: `BEGIN IMMEDIATE`.

2. **Modifica items:** transazione + lock sulla riga `orders` (verifica
   `lock_version` + `status === 'active'`). Se `lock_version` non corrisponde:
   409 `STALE_ORDER`.

3. **Chiusura ordine:** transazione + lock su `orders` + `tables`. Invoca
   payment, aggiorna tutto atomicamente.

4. **Optimistic locking:** il client passa `lock_version` nel body. Il server:
   - Legge l'ordine con `FOR UPDATE`
   - Confronta `lock_version`
   - Se diverso: 409 `STALE_ORDER` (il client deve ri-fetchare)
   - Se uguale: procede, incrementa `lock_version`

5. **Retry policy:** identica ad ADR-0001 -- `withRetry` da `db-lock.js`,
   3 tentativi, backoff 50/150/450ms + jitter 25%. Errore finale:
   503 `ORDER_CONTENTION`.

**Riuso utility:** `withRetry`, `getDialect`, `isSqlite` da
`strapi/src/utils/db-lock.js` (gia esistente). Aggiungiamo nuove funzioni
di lock specifiche per orders:

```js
async function lockOrder(trx, orderId, dialect) {
  if (isSqlite(dialect)) return;
  await trx.raw('SELECT id FROM orders WHERE id = ? FOR UPDATE', [orderId]);
}

async function lockTable(trx, tableId, dialect) {
  if (isSqlite(dialect)) return;
  await trx.raw('SELECT id FROM tables WHERE id = ? FOR UPDATE', [tableId]);
}
```

---

### ADR-0002.9 -- Contratto API

#### 9.1 Tavoli

**`GET /api/tables`** (autenticato)
Lista tavoli del ristorante. Scoped su `fk_user`.
Response: `{ data: [...], meta: { total } }`

**`POST /api/tables`** (autenticato)
Crea tavolo. Body: `{ number, seats, area? }`.
Check unicita `(number, fk_user)` in transazione.
Response 201: `{ data: { documentId, number, seats, area, status } }`

**`PATCH /api/tables/:documentId`** (autenticato)
Aggiorna tavolo. Body: `{ number?, seats?, area? }`.
Non ammesso se il tavolo ha un ordine attivo (status `occupied`).
Response: `{ data: { ... } }`

**`DELETE /api/tables/:documentId`** (autenticato)
Elimina tavolo. Non ammesso se status `occupied`.
Response 204.

#### 9.2 Ordini

**`POST /api/orders`** (autenticato)
Apre ordine per un tavolo. Body: `{ table_id (documentId), covers? }`.
Transazione + check "no ordine attivo su quel tavolo".
Aggiorna `table.status = 'occupied'`.
Response 201: `{ data: { documentId, status, opened_at, total_amount, lock_version, table: {...}, items: [] } }`
Errori: `INVALID_PAYLOAD` (400), `TABLE_NOT_FOUND` (404), `NOT_OWNER` (403),
`TABLE_ALREADY_OCCUPIED` (409), `ORDER_CONTENTION` (503).

**`GET /api/orders`** (autenticato)
Lista ordini utente. Query: `status` (CSV), `table` (documentId), `from`, `to`
(ISO datetime), `page`, `pageSize` (default 1/25, cap 100).
Scoped `fk_user`. Sort `opened_at:desc`.
Response: `{ data: [...], meta: { pagination: {...} } }`

**`GET /api/orders/:documentId`** (autenticato)
Dettaglio ordine + items (populate).
Response: `{ data: { documentId, status, opened_at, closed_at, total_amount, payment_status, payment_reference, lock_version, covers, table: {...}, items: [...] } }`
Errori: `ORDER_NOT_FOUND` (404), `NOT_OWNER` (403).

**`GET /api/orders/:documentId/total`** (autenticato)
Totale derivato in tempo reale.
Response: `{ data: { subtotal, tax, discount, total } }`

**`POST /api/orders/:documentId/items`** (autenticato)
Aggiunge item. Due modalita:
- Da menu: `{ element_id (documentId), quantity, notes? }` -- server prende
  name/price dal menu Element.
- Libero: `{ name, price, quantity, notes? }` -- item fuori menu.
Ricalcola totale. Incrementa `lock_version`.
Body deve includere `lock_version` per optimistic locking.
Response 201: `{ data: { item: {...}, order: { total_amount, lock_version } } }`
Errori: `ORDER_NOT_FOUND` (404), `NOT_OWNER` (403), `ORDER_NOT_ACTIVE` (409),
`STALE_ORDER` (409), `INVALID_PAYLOAD` (400).

**`PATCH /api/orders/:documentId/items/:itemDocumentId`** (autenticato)
Update quantity/notes. Solo se `item.status === 'taken'` e
`order.status === 'active'`. Body: `{ quantity?, notes?, lock_version }`.
Ricalcola totale.
Response: `{ data: { item: {...}, order: { total_amount, lock_version } } }`
Errori: `ITEM_NOT_EDITABLE` (409), `STALE_ORDER` (409).

**`DELETE /api/orders/:documentId/items/:itemDocumentId`** (autenticato)
Elimina item. Solo se `item.status === 'taken'`.
Body: `{ lock_version }`.
Ricalcola totale.
Response: `{ data: { order: { total_amount, lock_version } } }`

**`PATCH /api/orders/:documentId/items/:itemDocumentId/status`** (autenticato)
Transizione stato item (FSM enforced). Body: `{ status }`.
Non richiede `lock_version` (la FSM e unidirezionale, no conflitti).
Response: `{ data: { item: {...} } }`
Errori: `INVALID_ITEM_TRANSITION` (400), `ORDER_NOT_ACTIVE` (409).

**`POST /api/orders/:documentId/close`** (autenticato)
Chiude ordine. Body: `{ payment_method?: "simulator"|"pos"|"fiscal_register", lock_version }`.
Default: "simulator".
Invoca payment_service. Se OK: chiude ordine, rilascia tavolo.
Response: `{ data: { order: {...}, payment: { transactionId, timestamp } } }`
Errori: `ORDER_NOT_ACTIVE` (409), `STALE_ORDER` (409), `PAYMENT_DECLINED` (402),
`PAYMENT_TIMEOUT` (504), `PAYMENT_UNAVAILABLE` (503).

#### 9.3 Codici errore

| Code | HTTP | Semantica |
|------|------|-----------|
| `INVALID_PAYLOAD` | 400 | Body malformato, tipi errati |
| `INVALID_ITEM_TRANSITION` | 400 | Transizione stato item non ammessa |
| `NOT_OWNER` | 403 | L'utente non possiede la risorsa |
| `TABLE_NOT_FOUND` | 404 | Tavolo non trovato |
| `ORDER_NOT_FOUND` | 404 | Ordine non trovato |
| `ITEM_NOT_FOUND` | 404 | Item non trovato |
| `TABLE_ALREADY_OCCUPIED` | 409 | Tavolo gia occupato da ordine attivo |
| `ORDER_NOT_ACTIVE` | 409 | Ordine gia chiuso |
| `ITEM_NOT_EDITABLE` | 409 | Item non piu modificabile (status != taken) |
| `STALE_ORDER` | 409 | lock_version non corrisponde |
| `ORDER_CONTENTION` | 503 | Deadlock DB dopo retry esauriti |
| `PAYMENT_DECLINED` | 402 | Pagamento rifiutato |
| `PAYMENT_TIMEOUT` | 504 | Timeout pagamento |
| `PAYMENT_UNAVAILABLE` | 503 | Strategy non disponibile |

---

### ADR-0002.10 -- Routing e permessi

**File:** `strapi/src/api/order/routes/custom-order.js`
**File:** `strapi/src/api/table/routes/custom-table.js`

```js
// custom-table.js
module.exports = {
  routes: [
    { method: 'GET',    path: '/tables',              handler: 'table.list',    config: { policies: [], middlewares: [] } },
    { method: 'POST',   path: '/tables',              handler: 'table.create',  config: { policies: [], middlewares: [] } },
    { method: 'PATCH',  path: '/tables/:documentId',  handler: 'table.update',  config: { policies: [], middlewares: [] } },
    { method: 'DELETE', path: '/tables/:documentId',  handler: 'table.remove',  config: { policies: [], middlewares: [] } },
  ],
};

// custom-order.js
module.exports = {
  routes: [
    { method: 'POST',   path: '/orders',                                         handler: 'order.create',           config: { policies: [], middlewares: [] } },
    { method: 'GET',    path: '/orders',                                         handler: 'order.list',             config: { policies: [], middlewares: [] } },
    { method: 'GET',    path: '/orders/:documentId',                             handler: 'order.findOne',          config: { policies: [], middlewares: [] } },
    { method: 'GET',    path: '/orders/:documentId/total',                       handler: 'order.getTotal',         config: { policies: [], middlewares: [] } },
    { method: 'POST',   path: '/orders/:documentId/items',                       handler: 'order.addItem',          config: { policies: [], middlewares: [] } },
    { method: 'PATCH',  path: '/orders/:documentId/items/:itemDocumentId',       handler: 'order.updateItem',       config: { policies: [], middlewares: [] } },
    { method: 'DELETE', path: '/orders/:documentId/items/:itemDocumentId',       handler: 'order.deleteItem',       config: { policies: [], middlewares: [] } },
    { method: 'PATCH',  path: '/orders/:documentId/items/:itemDocumentId/status', handler: 'order.updateItemStatus', config: { policies: [], middlewares: [] } },
    { method: 'POST',   path: '/orders/:documentId/close',                       handler: 'order.close',           config: { policies: [], middlewares: [] } },
  ],
};
```

**Permessi (bootstrap `grantImportPermissions` esteso):**
Aggiungere per il ruolo `authenticated`:

```
api::table.table.list
api::table.table.create
api::table.table.update
api::table.table.remove
api::order.order.create
api::order.order.list
api::order.order.findOne
api::order.order.getTotal
api::order.order.addItem
api::order.order.updateItem
api::order.order.deleteItem
api::order.order.updateItemStatus
api::order.order.close
```

---

## 3. Impatto sul codice esistente

### 3.1 Backend (Strapi) -- FILE NUOVI

| File | Descrizione |
|------|-------------|
| `strapi/src/api/table/content-types/table/schema.json` | Schema Table |
| `strapi/src/api/table/controllers/table.js` | Controller CRUD tavoli |
| `strapi/src/api/table/routes/custom-table.js` | Routes tavoli |
| `strapi/src/api/table/services/table.js` | Service boilerplate |
| `strapi/src/api/order/content-types/order/schema.json` | Schema Order |
| `strapi/src/api/order-item/content-types/order-item/schema.json` | Schema OrderItem |
| `strapi/src/api/order/controllers/order.js` | Controller ordini (tutti gli endpoint) |
| `strapi/src/api/order/routes/custom-order.js` | Routes ordini |
| `strapi/src/api/order/services/order.js` | Service boilerplate |
| `strapi/src/api/order-item/controllers/order-item.js` | Controller boilerplate |
| `strapi/src/api/order-item/routes/order-item.js` | Routes boilerplate (vuote, tutto via order) |
| `strapi/src/api/order-item/services/order-item.js` | Service boilerplate |
| `strapi/src/utils/order-total.js` | computeTotal + recalculateTotal |
| `strapi/src/services/payment/index.js` | Payment registry/factory |
| `strapi/src/services/payment/strategies/simulator.js` | Simulator strategy |
| `strapi/src/services/payment/strategies/pos.js` | POS stub |
| `strapi/src/services/payment/strategies/fiscal-register.js` | Fiscal register stub |

### 3.2 Backend -- FILE MODIFICATI

| File | Modifica |
|------|----------|
| `strapi/src/index.js` | `seedDemoData`: aggiunge 5 tavoli demo. `grantImportPermissions`: aggiunge permessi table + order. |
| `strapi/src/utils/db-lock.js` | Aggiunge `lockOrder`, `lockTable` |
| `strapi/.env.example` | Aggiunge `PAYMENT_STRATEGY`, `PAYMENT_SIMULATOR_LATENCY_MS`, `PAYMENT_SIMULATOR_FAILURE_RATE` |

### 3.3 File NON toccati (vincolo esplicito)

- `strapi/src/api/reservation/` -- tutto intatto
- `strapi/src/api/website-config/` -- tutto intatto
- `strapi/src/utils/season.js` -- intatto
- `strapi/src/utils/reservation-slot.js` -- intatto
- `ocr-service/` -- intatto

### 3.4 Frontend (Vue)

| File | Tipo | Descrizione |
|------|------|-------------|
| `vuejs/frontend/src/Pages/Orders.vue` | NEW | Pagina ordinazioni con toggle cameriere/cucina |
| `vuejs/frontend/src/components/OrdersTableGrid.vue` | NEW | Griglia tavoli (vista cameriere) |
| `vuejs/frontend/src/components/OrdersTableCard.vue` | NEW | Card singolo tavolo |
| `vuejs/frontend/src/components/OrderDetailModal.vue` | NEW | Dettaglio ordine con lista items |
| `vuejs/frontend/src/components/OrderItemRow.vue` | NEW | Riga singolo item in ordine |
| `vuejs/frontend/src/components/KitchenBoard.vue` | NEW | Board cucina con colonne per stato |
| `vuejs/frontend/src/components/KitchenItemCard.vue` | NEW | Card item in vista cucina |
| `vuejs/frontend/src/components/AddItemModal.vue` | NEW | Modal aggiunta item da menu o libero |
| `vuejs/frontend/src/components/CheckoutModal.vue` | NEW | Modal chiusura conto |
| `vuejs/frontend/src/components/OrderStatusBadge.vue` | NEW | Badge stato ordine/item |
| `vuejs/frontend/src/utils.js` | MOD | +funzioni API orders |
| `vuejs/frontend/src/router/index.js` | MOD | +rotta `/orders` |
| `vuejs/frontend/src/Layouts/AppLayout.vue` | MOD | +voce "Ordinazioni" con badge |

---

## 4. Rischi e vincoli residui

| Rischio | Probabilita | Mitigazione |
|---------|-------------|-------------|
| Cameriere e cucina modificano stesso item simultaneamente | media | Optimistic locking (`lock_version`) + FSM unidirezionale items. La cucina avanza lo stato, il cameriere modifica solo `taken`. Nessun conflitto possibile sullo stato. |
| Payment simulator non deterministico in test | bassa | `PAYMENT_SIMULATOR_FAILURE_RATE=0` di default. Deterministico per CI. |
| SQLite serializza tutto (bottleneck dev) | bassa | Solo dev/test. Produzione su MySQL. |
| Table.status out of sync con ordini | bassa | Aggiornato atomicamente nella stessa transazione di apertura/chiusura ordine. |
| Ordini attivi non chiusi (cameriere dimentica) | media | v2: job notturno per auto-chiusura ordini > N ore. v1: responsabilita del ristoratore. |

---

## 5. Evoluzioni future (non scope v1)

1. **Split bill** -- divisione conto tra piu paganti (richiede sub-totals per gruppo).
2. **IVA e sconti** -- `computeTotal` gia predisposto con `taxRate` e `discounts`.
3. **Integrazione POS reale** -- strategy `pos.js` da implementare (es. SumUp, Nexi).
4. **Cassa fiscale / scontrino** -- strategy `fiscal-register.js` per RT (registratore telematico).
5. **Integrazione reservation-table** -- un tavolo `reserved` puo essere pre-assegnato a una prenotazione.
6. **KDS (Kitchen Display System)** -- board cucina full-screen con notifiche sonore.
7. **Storicizzazione ordini** -- archivio ordini chiusi per analytics e contabilita.

---

## 6. Conseguenze

**Positive:**
- Riuso pattern concorrenza da ADR-0001 (zero nuove dipendenze).
- Payment service astratto e estensibile senza modifiche al controller.
- FSM item unidirezionale elimina conflitti cameriere-cucina sullo stato.
- Optimistic locking (`lock_version`) previene sovrascritture su quantita/note.
- `computeTotal` design-ready per IVA/sconti.

**Negative / costi:**
- 3 nuovi content type (table, order, order-item) aumentano la surface area.
- `table.status` denormalizzato richiede aggiornamento atomico in transazione.
- Optimistic locking aggiunge complessita al frontend (gestione 409 + retry).

---

**Fine ADR-0002.**
