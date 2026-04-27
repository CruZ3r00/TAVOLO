# pos-rt-service — Piano di Sviluppo

**Stato:** proposto
**Data:** 2026-04-24
**Ambito:** servizio `pos-rt-service/` (isolato dal monorepo)
**Riferimenti:** `CLAUDE.md` di progetto, ADR-0002 (orders), ADR-0003 (questa proposta, a livello monorepo)

---

## 0. Obiettivo

Costruire un servizio Node.js installabile localmente (`.exe` su Windows) che funge da **ponte** tra Strapi (backend cloud o remoto) e i **dispositivi fisici** presenti nel ristorante (stampante scontrino di cortesia, Registratore Telematico fiscale, terminale POS). Il servizio viene installato dal ristoratore sulla macchina che ha accesso ai dispositivi, si appaia con l'account Strapi dell'utente e da quel momento esegue in autonomia le operazioni richieste dal backend (stampa conto, pagamento, scontrino fiscale).

Il servizio **NON condivide codice** con Strapi/Vue/OCR: è un repository indipendente dentro il monorepo (`pos-rt-service/`) con la propria toolchain, le proprie dipendenze e la propria build.

---

## 1. Principi architetturali

### 1.1 Zero traffico in entrata da internet

La macchina del ristoratore è dietro NAT domestico/aziendale. Aprire una porta in entrata richiederebbe port-forwarding sul router, firewall rule, DNS dinamico: friction di installazione inaccettabile.

**Decisione:** tutte le connessioni sono **outbound-initiated** dal servizio verso Strapi. Il servizio espone un'API HTTP **solo su `127.0.0.1`** per il wizard di pairing e il pannello di diagnostica locale — mai raggiungibile da internet.

### 1.2 Pull + push-through-outbound

- **Canale principale (real-time):** WebSocket client-initiated verso `wss://<strapi>/ws/pos`. La connessione è aperta dal servizio (outbound); una volta stabilita, Strapi può inviare eventi server→client senza nuove connessioni — niente port forwarding, niente firewall inbound.
- **Canale di fallback (batch):** HTTP polling ogni 10s (configurabile) verso `GET /api/pos-devices/me/jobs?since=<cursor>`. Funziona anche quando il WebSocket è giù (network glitch, Strapi restart, proxy che chiude connessioni lunghe).
- Il polling è **sempre attivo** a bassa frequenza (60s) anche con WS connesso, per garantire catch-up se un evento WS viene perso.

### 1.3 Idempotenza end-to-end

Ogni job emesso da Strapi ha un `event_id` UUID immutabile. Il servizio lo usa come **idempotency key**: inserimento in coda con `UNIQUE(event_id)` → duplicati scartati automaticamente. L'ack verso Strapi porta lo stesso `event_id` → Strapi non riapre il job già completato.

### 1.4 Storage locale cifrato

SQLite (via `better-sqlite3`) con WAL mode. Tabelle "normali" in chiaro; tabella `secrets` (device token, credenziali driver) cifrata a livello di record con AES-256-GCM, master key derivata da una chiave generata al primo avvio + fingerprint di macchina (protetta via DPAPI su Windows quando disponibile).

### 1.5 Audit append-only

Corrispettivi e operazioni fiscali su `audit_log` **append-only hash-chained**: ogni record contiene `prev_hash`, quindi alterazioni storiche sono rilevabili. Retention 10 anni come da normativa fiscale italiana.

### 1.6 Fail-safe, non fail-loud

Il servizio deve sopravvivere a: Strapi irraggiungibile, dispositivo spento, disco pieno, rete flapping. La coda persiste, il retry si riprende, l'utente vede lo stato su UI locale. Nessuna perdita silenziosa di corrispettivi.

### 1.7 Zero dipendenze incrociate

Vincoli da `pos-rt-service/CLAUDE.md`: non importare codice da altre dir del monorepo, non essere importato da altre dir. Il contratto con Strapi è **solo HTTP/WS**, versionato.

---

## 2. Stack tecnico

### 2.1 Runtime e librerie

| Dipendenza | Versione | Uso |
|---|---|---|
| Node.js | 20 LTS | Runtime |
| `express` | ^4.19 | API locale su loopback |
| `ws` | ^8.18 | WebSocket client verso Strapi |
| `axios` | ^1.7 | HTTP client verso Strapi |
| `better-sqlite3` | ^11 | SQLite sincrono ad alte prestazioni |
| `node-cron` | ^3.0 | Scheduler job periodici |
| `pino` + `pino-pretty` | ^9 | Logging strutturato JSON |
| `pino-roll` | ^2 | Rotazione file di log |
| `zod` | ^3 | Validazione input/payload |
| `dotenv` | ^16 | Env config (solo dev) |
| `ulid` | ^2 | ID ordinabili per tracing interno |
| `p-queue` | ^8 | Concorrenza controllata driver |

### 2.2 Driver hardware (caricati via registry)

| Dipendenza | Scopo | Stato v1 |
|---|---|---|
| `escpos` + `escpos-usb` + `escpos-network` | Scontrino di cortesia generico | **Funzionale** |
| `serialport` | Connessione seriale RT | **Funzionale (layer base)** |
| SDK Epson FP-90III | RT fiscale Epson | **Stub + interfaccia** (certificazione post v1) |
| SumUp / Nexi / Ingenico SDK | Terminale POS | **Stub + interfaccia** (integrazione post v1) |

### 2.3 Packaging e distribuzione

| Tool | Uso |
|---|---|
| `@yao-pkg/pkg` | Bundling runtime + codice → singolo `.exe` |
| `node-windows` | Wrap del binario in Windows Service |
| NSIS | Installer grafico (wizard + service registration) |
| Authenticode EV cert | Code signing (anti-SmartScreen) |

---

## 3. Struttura del repository

```
pos-rt-service/
├── src/
│   ├── main.js                      # entry point (service bootstrap)
│   ├── app.js                       # wire-up dei moduli
│   ├── config/
│   │   ├── defaults.js              # costanti non-segrete
│   │   └── loader.js                # merge defaults → env → DB override
│   ├── storage/
│   │   ├── db.js                    # wrapper better-sqlite3 (WAL, prepared)
│   │   ├── migrations/
│   │   │   ├── 001_init.sql
│   │   │   ├── 002_audit_chain.sql
│   │   │   └── ...
│   │   ├── migrator.js              # up/down sequenziale
│   │   └── repositories/
│   │       ├── configRepo.js
│   │       ├── secretsRepo.js
│   │       ├── deviceRepo.js
│   │       ├── jobQueueRepo.js
│   │       ├── auditRepo.js
│   │       └── syncStateRepo.js
│   ├── services/
│   │   ├── httpClient.js            # axios + auth device token + retry
│   │   ├── wsClient.js              # WebSocket outbound, auto-reconnect
│   │   ├── syncService.js           # pull jobs, ack jobs
│   │   ├── queueManager.js          # enqueue, dispatch, retry, DLQ
│   │   ├── scheduler.js             # cron + single-flight lock
│   │   └── healthService.js         # probe interni
│   ├── drivers/
│   │   ├── printer/
│   │   │   ├── base.js              # interfaccia astratta
│   │   │   ├── stub.js              # mock per dev/CI
│   │   │   ├── escpos.js            # scontrino cortesia USB/LAN
│   │   │   └── epson-fp90.js        # stub RT (da completare)
│   │   ├── payment/
│   │   │   ├── base.js
│   │   │   ├── stub.js
│   │   │   └── sumup.js             # stub (da completare)
│   │   └── registry.js              # carica driver da configRepo
│   ├── modules/
│   │   ├── pairing/                 # flusso primo appaiamento
│   │   │   └── index.js
│   │   ├── print/                   # mapping job→driver print
│   │   │   └── index.js
│   │   └── payment/                 # mapping job→driver payment
│   │       └── index.js
│   ├── api/
│   │   ├── index.js                 # express app su 127.0.0.1
│   │   ├── middleware/
│   │   │   ├── loopback-only.js
│   │   │   ├── local-auth.js        # PIN locale
│   │   │   └── rate-limit.js
│   │   ├── routes/
│   │   │   ├── health.js
│   │   │   ├── status.js
│   │   │   ├── pair.js              # disabilitato dopo primo uso
│   │   │   ├── admin.js             # test-print, retry, cancel
│   │   │   └── logs.js
│   │   └── ui/                      # HTML statico wizard + dashboard
│   └── utils/
│       ├── logger.js
│       ├── crypto.js                # AES-256-GCM + scrypt
│       ├── machine.js               # fingerprint macchina + DPAPI
│       ├── errors.js                # AppError con codici
│       ├── validation.js            # schemi zod riusabili
│       └── backoff.js               # jitter + exp
├── installer/
│   ├── nsis/
│   │   ├── installer.nsi
│   │   └── assets/                  # icona, LICENSE, etc.
│   └── service/
│       ├── install.js               # node-windows registration
│       └── uninstall.js
├── scripts/
│   ├── build.js                     # prep bundle
│   ├── pack.js                      # pkg invocation
│   ├── sign.js                      # signtool wrapper
│   └── migrate.js                   # CLI migration runner (dev)
├── tests/
│   ├── unit/
│   ├── integration/                 # full flow pairing + pull + execute
│   └── e2e/                         # con Strapi mock
├── docs/
│   ├── PLAN.md                      # (questo file)
│   ├── INSTALL.md                   # guida installazione ristoratore
│   ├── TROUBLESHOOTING.md
│   └── adr/
│       ├── 0001-outbound-only-architecture.md
│       ├── 0002-storage-and-crypto.md
│       ├── 0003-queue-and-idempotency.md
│       └── 0004-fiscal-compliance.md
├── migrations/                      # seed data opzionale
├── package.json
├── .env.example
├── .gitignore
├── .eslintrc.json
├── .prettierrc
├── README.md
├── todo.md
└── CLAUDE.md                        # esistente
```

---

## 4. Contratto con Strapi (interfacce esterne)

Queste API **devono essere aggiunte a Strapi** nella Fase 13 del piano. Il contratto è stabile e versionato (`/api/v1/pos-devices/...`).

### 4.1 Pairing (auth: JWT utente)

- `POST /api/pos-devices/register`
  - Body: `{ name, fingerprint }`
  - Response: `{ data: { documentId, device_token, strapi_url, ws_url } }`
  - Side-effect: crea record `pos-device` legato a `fk_user`, salva `device_token_hash` (sha256), restituisce `device_token` **una sola volta** (chiaro)

- `POST /api/pos-devices/:documentId/revoke`
  - Response: `204`
  - Side-effect: setta `revoked_at`; WS connessioni aperte con quel token sono chiuse; polling successivi riceveranno `401`

### 4.2 Runtime (auth: `X-Device-Token`)

- `GET /api/pos-devices/me/jobs?since=<cursor>&limit=50`
  - Response: `{ data: [ { id, event_id, kind, payload, created_at, priority } ], meta: { next_cursor } }`
  - Filtra `status=pending`, scoped al device del token

- `POST /api/pos-devices/me/jobs/:event_id/ack`
  - Body: `{ result: "success"|"failure", outcome: { transactionId?, receipt_no?, error_code?, error_message? } }`
  - Response: `200 { data: { order_updated: true } }`
  - Side-effect su success: aggiorna `order.fiscal_status='completed'`, `order.fiscal_receipt_id=...`, incrementa `lock_version`

- `POST /api/pos-devices/me/heartbeat`
  - Body: `{ version, uptime, queue_stats, drivers_status }`
  - Response: `204`
  - Side-effect: aggiorna `pos-device.last_seen`

- `GET /api/pos-devices/me/config`
  - Response: `{ data: { polling_interval_ms, drivers: { printer: "escpos", payment: "stub" }, features: {...} } }`
  - Permette override server-side della config client (feature flag)

### 4.3 WebSocket

- `WS /ws/pos` con header `Authorization: Bearer <device_token>` (o query `?token=` per client che non supportano header in upgrade)

- **Server→client:**
  - `{ type: "job.new", id, event_id, kind, payload }` — nuovo job disponibile (il client può pullarlo o già consumarlo dal payload)
  - `{ type: "job.cancel", event_id }` — job annullato lato Strapi
  - `{ type: "config.update", config }` — push config
  - `{ type: "ping" }` (server keepalive)

- **Client→server:**
  - `{ type: "ack", event_id, result, outcome }`
  - `{ type: "heartbeat", stats }`
  - `{ type: "pong" }`

- Chiusura: `4001` token invalido, `4002` device revocato, `1011` server error.

### 4.4 Modifiche ai content type esistenti (Strapi)

**`api::order.order` (estensione):**

```json
"fiscal_status": { "type": "enumeration", "enum": ["not_required", "pending", "completed", "failed"], "default": "not_required" },
"fiscal_receipt_id": { "type": "string", "nullable": true },
"fiscal_dispatched_at": { "type": "datetime", "nullable": true },
"fiscal_event_id": { "type": "string", "nullable": true }
```

**Nuovo content type `api::pos-device.pos-device`:**

```json
{
  "kind": "collectionType",
  "attributes": {
    "name": { "type": "string", "required": true, "maxLength": 120 },
    "device_token_hash": { "type": "string", "required": true, "private": true },
    "fingerprint": { "type": "string", "required": true },
    "last_seen": { "type": "datetime" },
    "revoked_at": { "type": "datetime" },
    "version": { "type": "string" },
    "fk_user": { "type": "relation", "relation": "manyToOne", "target": "plugin::users-permissions.user" }
  }
}
```

**Close order controller (estensione):** quando si chiude un ordine con `payment_method=pos|fiscal_register`, invece di chiamare direttamente la strategy, il controller:

1. Genera `fiscal_event_id = ulid()`
2. Inserisce un job `pos_job` (nuova tabella tecnica o JSON in `pos-device.pending_jobs`) con `kind: "order.close"`, `payload: { order_doc_id, total, items, vat_split }`
3. Marca `order.fiscal_status = 'pending'`
4. Se WebSocket device connesso: push `job.new` subito
5. Ritorna `202 Accepted` al frontend con `fiscal_event_id`
6. Il frontend mostra spinner "in attesa del registratore"; poll `GET /api/orders/:id` fino a `fiscal_status=completed|failed`

**Compatibilità:** se il ristoratore non ha registrato alcun `pos-device`, `payment_method=pos|fiscal_register` fallback al comportamento attuale (strategy `NotImplementedError`). Metodo `simulator` invariato.

---

## 5. Schema del database locale

### 5.1 Migration 001 — init

```sql
-- config non-sensibili
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- secret (cifrati a record, AES-256-GCM)
CREATE TABLE secrets (
  key TEXT PRIMARY KEY,
  value_enc BLOB NOT NULL,
  iv BLOB NOT NULL,
  tag BLOB NOT NULL,
  updated_at TEXT NOT NULL
);

-- record singleton del device
CREATE TABLE device (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  strapi_url TEXT NOT NULL,
  ws_url TEXT NOT NULL,
  name TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  last_sync_at TEXT
);

-- coda lavori
CREATE TABLE job_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,                 -- 'order.close', 'print.receipt', ...
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,               -- pending|in_progress|done|failed|dead_letter
  priority INTEGER NOT NULL DEFAULT 100,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_attempt_at TEXT,
  next_attempt_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  dlq_reason TEXT
);
CREATE INDEX idx_job_status_next ON job_queue(status, next_attempt_at);
CREATE INDEX idx_job_kind ON job_queue(kind);

-- stato sync incrementale
CREATE TABLE sync_state (
  entity TEXT PRIMARY KEY,
  last_cursor TEXT,
  last_pulled_at TEXT
);
```

### 5.2 Migration 002 — audit chain

```sql
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- 'receipt.printed', 'payment.charged', 'job.ack', ...
  event_id TEXT,                      -- link al job se presente
  payload_hash TEXT NOT NULL,         -- sha256 del payload canonicalizzato
  prev_hash TEXT NOT NULL,            -- hash del record precedente (id-1) o '0'*64 per il primo
  chain_hash TEXT NOT NULL,           -- sha256(id || ts || kind || payload_hash || prev_hash)
  meta_json TEXT                      -- metadati non PII
);
CREATE INDEX idx_audit_ts ON audit_log(ts);
CREATE INDEX idx_audit_kind ON audit_log(kind);
```

Regola: nessuna `UPDATE`/`DELETE` su `audit_log` dal codice applicativo. Un controllo periodico ricalcola la chain e alerta in caso di mismatch.

---

## 6. Roadmap per fasi

> Durate in giorni-uomo ingegnere senior full-time. Serial dependency salvo dove indicato "parallela".

### Fase 0 — Bootstrap (1g)
- `package.json` con script `dev`, `start`, `build`, `migrate`, `test`, `lint`
- ESLint + Prettier + `.editorconfig`
- Logger `pino` con livelli e rotation
- Config loader (defaults → env → DB)
- Globale `process.on('uncaughtException')` + graceful shutdown

**Verifica:** `npm run dev` avvia un processo vuoto che logga "ready" e si spegne pulito su SIGINT.

### Fase 1 — Storage (2g)
- Wrapper `better-sqlite3` con WAL + `synchronous = NORMAL` + `foreign_keys = ON`
- Migrator sequenziale (up solo in v1, down solo per dev)
- Migration 001 + 002
- Repositories con prepared statements cachate
- `utils/crypto.js` (AES-256-GCM, scrypt per KDF)
- `utils/machine.js` (fingerprint = hash di `osHostname + primaryMacAddress + platform`)

**Verifica:** unit test per crypto round-trip, audit chain verification, idempotency insert su `job_queue`.

### Fase 2 — Pairing (1g)
- Modulo `modules/pairing` + route `POST /pair`
- UI HTML wizard embedded (`api/ui/pair.html`)
- Flusso:
  1. Admin locale inserisce `strapi_url`, `email`, `password`
  2. Servizio chiama `POST /api/auth/local` → JWT
  3. Servizio chiama `POST /api/pos-devices/register` con JWT → `device_token`
  4. Servizio cifra e salva `device_token` + `strapi_url` in `secrets` + `device`
  5. Servizio genera `local_pin` (6 cifre) mostrato all'admin **una volta**
  6. Endpoint `/pair` disabilitato da questo momento
- Eliminazione credenziali Strapi dalla memoria subito dopo

**Verifica:** test con Strapi mock. Dopo pairing: `GET /status` ritorna `paired=true`, `device.id=1`, secret presente.

### Fase 3 — HTTP client + sync pull (2g)
- `services/httpClient.js` axios wrapper con:
  - Auto-inject `X-Device-Token`
  - Retry su 5xx/429/ECONNRESET (max 3 con backoff)
  - Timeout 15s
  - Cert pinning opzionale (toggle config)
- `services/syncService.js`:
  - `pullJobs()` → GET `/api/pos-devices/me/jobs?since=<cursor>` → enqueue
  - `ackJob(eventId, result, outcome)` → POST ack
  - Gestione cursor in `sync_state`

**Verifica:** integration test con Strapi mock che serve 5 job, tutti arrivano in coda una sola volta.

### Fase 4 — WebSocket client (2g)
- `services/wsClient.js`:
  - Connect verso `ws_url` con header `Authorization: Bearer <device_token>`
  - Stato: `disconnected`, `connecting`, `connected`, `backoff`
  - Ping client → server ogni 20s, se no pong in 40s → reconnect
  - Reconnect backoff: 1s, 2s, 4s, 8s, 15s, 30s + jitter 25%
  - Handler eventi → delegano a `syncService`/`queueManager`
  - Emette eventi: `ws:connected`, `ws:disconnected`, `ws:message`

**Verifica:** test con server WS mock che chiude ogni 10s → client si riconnette indefinitamente, backoff corretto.

### Fase 5 — Queue manager (2g)
- `services/queueManager.js`:
  - `enqueue(job)` — INSERT `ON CONFLICT(event_id) DO NOTHING`
  - `dispatch()` — SELECT fino a N job pending con `next_attempt_at <= now`, UPDATE status=`in_progress`, esegue via driver
  - Concurrency via `p-queue` (default 1, per driver lock su hardware seriale)
  - `markDone(id, outcome)` → status=done + ack a Strapi
  - `markFailed(id, error)` → attempts++, `next_attempt_at` esponenziale, oltre 6 attempts → dead_letter
  - Audit ogni transizione

**Verifica:** test con driver stub che fallisce 3 volte → retry corretto; stub che throws sempre → arriva DLQ; 100 job → 0 duplicati.

### Fase 6 — Scheduler (1g)
- `services/scheduler.js` con `node-cron`:
  - `pull-jobs`: ogni 10s se WS disconnesso, ogni 60s se connesso
  - `retry-failed`: ogni 60s chiama `queueManager.dispatch()`
  - `heartbeat`: ogni 30s POST heartbeat
  - `reconnect-ws`: ogni 5s se `wsClient.state == disconnected` e non già `connecting`
  - `cleanup-old-jobs`: ogni notte 04:00, DELETE status in (done, dead_letter) older than 30gg
  - `verify-audit-chain`: ogni notte 03:00, ricalcolo e alert su mismatch
- Single-flight lock per ogni job (no sovrapposizione)

**Verifica:** chaos test — kill WS → pull parte al 10s, heartbeat continua; restart WS → pull torna a 60s.

### Fase 7 — Driver layer (3g)
- Interfacce `drivers/printer/base.js` e `drivers/payment/base.js`
- Stub completi con `simulateLatency`, `simulateFailureRate`
- **ESC/POS**: implementazione generica con `escpos` + `escpos-usb` e `escpos-network`
  - Template: header (logo+nome), items (nome+qty+prezzo), totali, footer
  - Taglio carta, apertura cassetto (opz)
- **Epson FP-90III**: wrapper su protocollo seriale (Layer 1 + comandi XON3) — **stub iniziale** che simula la risposta OK (implementazione reale richiede documentazione ufficiale e test su device certificato)
- **SumUp**: stub — integrazione reale richiede SDK commerciale (post v1)
- Registry che carica driver da `config.drivers.printer`, `config.drivers.payment`
- Hot-swap driver a runtime via admin API

**Verifica:** `POST /admin/test-print` stampa uno scontrino reale su stampante USB collegata in sviluppo.

### Fase 8 — Moduli business (2g)
- `modules/print/index.js`: trasforma payload job `order.close` → chiamata driver printer + driver payment
  - Flusso tipico: `payment.charge` → su success `printer.printFiscalReceipt` → ack Strapi con `transactionId` + `receipt_no`
  - Gestione rollback: se print fallisce dopo charge → refund automatico (se driver supporta) o DLQ con alert
- `modules/payment/index.js`: chiamata al driver payment con idempotency key = `event_id`
- Validazione payload con zod, rifiuta job malformati → ack failure

**Verifica:** e2e con stub driver: ordine chiuso → pagamento → stampa → ack → order fiscal_status=completed.

### Fase 9 — API locale admin (1.5g)
- Express app bound a `127.0.0.1`, porta allocata dinamicamente al primo avvio (salvata in `config`)
- Middleware `loopback-only.js`: rifiuta request con `req.socket.remoteAddress !== '127.0.0.1'`
- Middleware `local-auth.js`: richiede header `X-Local-Pin` (eccetto `/health` e `/pair` first-run)
- Rate limit 30 req/min
- Endpoint:
  - `GET /health` → `200 { status: "ok", version, uptime }`
  - `GET /status` → stato WS, code, ultima sync, device info
  - `POST /pair` → first-run only
  - `POST /unpair` → richiede PIN + conferma testuale
  - `POST /admin/test-print` → stampa test
  - `POST /admin/jobs/:id/retry` | `/cancel`
  - `GET /logs?limit=` → ultimi log tech
  - `GET /audit?from=&to=` → audit entries
  - Static UI in `/ui/*` (dashboard)
- UI HTML: 2 pagine (pair wizard, dashboard) — vanilla JS, zero framework, per ridurre surface attack

**Verifica:** `curl` da 127.0.0.1 funziona; `curl` da altro IP risponde 403; senza PIN → 401.

### Fase 10 — Audit & compliance (2g)
- `auditRepo.append(kind, eventId, payload, meta)`:
  - Calcola `payload_hash = sha256(canonicalJSON(payload))`
  - Recupera ultimo `chain_hash`
  - Calcola nuovo `chain_hash`
  - INSERT
- `auditRepo.verifyChain(from, to)` — ricalcolo sequenziale, ritorna `{ valid, mismatch_at? }`
- Endpoint `GET /audit` con filtri e paginazione
- Export XML corrispettivi giornaliero (placeholder schema AE) — file su disco, non inviato
- Retention: corrispettivi `audit_log.kind IN ('receipt.printed','payment.charged')` → 10 anni; altro → 12 mesi
- Cleanup job rispetta retention

**Verifica:** manomissione manuale di una riga `audit_log` → `verifyChain` riporta mismatch.

### Fase 11 — Packaging Windows (2g)
- `scripts/build.js`: compila/bundla (se serve), copia asset
- `scripts/pack.js`: `pkg -t node20-win-x64` → `pos-rt-service.exe`
- `installer/nsis/installer.nsi`:
  - Wizard: install dir (default `C:\Program Files\PosRtService`), user account per il service
  - Copia exe, crea cartelle data (`%ProgramData%\PosRtService\db`, `\logs`)
  - Genera master key al primo avvio + salva salt ACL-protetto
  - Registra servizio Windows via `node-windows` o direttamente `sc.exe`
  - Aggiunge firewall rule: solo loopback in ascolto
  - Apre browser su `http://127.0.0.1:<port>/ui/pair.html`
- `scripts/sign.js`: `signtool sign /fd sha256 /tr <TSA> /td sha256 /a <exe>`
- Auto-update: `GET /api/pos-devices/latest-version` → se nuovo, download, verifica firma, installa e restart service

**Verifica:** installer su VM Windows 11 pulita → pair wizard appare → pairing completa → servizio gira come system service → restart VM → servizio riparte.

### Fase 12 — Testing (3g)
- **Unit** (`tests/unit/`):
  - `crypto` round-trip encrypt/decrypt
  - `auditRepo` chain integrity (append + verify + tamper detection)
  - `queueManager` idempotency + retry + DLQ
  - `backoff` sequenze
  - `syncService` con HTTP mock
  - `wsClient` riconnessione con WS server mock
- **Integration** (`tests/integration/`):
  - Full flow pairing con Strapi mock (express app)
  - Pull + dispatch + ack su stub driver
- **E2E** (`tests/e2e/`):
  - Contro staging Strapi reale (richiede env var `STRAPI_URL_E2E`)
  - Ordine chiuso da UI Vue → job dispatched → stub driver → ack → order `fiscal_status=completed`
- **Load**: 1000 job in coda, concorrenza 5, zero loss, latenza < 1s per job stub
- **Chaos**:
  - Kill Strapi mid-sync → resume corretto
  - Kill DB file → errore controllato, audit non corrotto
  - Network partition durante WS → reconnect + catch-up pull

### Fase 13 — Modifiche Strapi (parallela Fasi 2-5, 2g)
Lavoro lato `strapi/`, non dentro `pos-rt-service/`. Le modifiche sono isolate in nuovo folder `strapi/src/api/pos-device/` + estensione `strapi/src/api/order/`.

1. Content type `pos-device` (schema + controller + routes)
2. Endpoint `/api/pos-devices/register` e `/revoke`
3. Middleware `device-token` che verifica `X-Device-Token` contro `device_token_hash`, imposta `ctx.state.device`
4. Endpoint runtime `/api/pos-devices/me/jobs`, `/ack`, `/heartbeat`, `/config`
5. Tabella tecnica `pos_jobs` (Knex migration) per la coda server-side
6. WebSocket server montato su `strapi/src/index.js` durante `bootstrap` hook (socket.io opzione, ma `ws` puro va bene per mantenere coerenza con il client)
7. Estensione close order controller:
   - Detect `payment_method in ('pos','fiscal_register')` + presenza `pos-device` attivo
   - Invece di chiamare strategy, crea `pos_job` e ritorna `202` con `fiscal_event_id`
   - Se WS del device connesso: push `job.new`
   - Frontend `Orders.vue` adatta UI per stato "in attesa"
8. Handler ack: valida outcome, aggiorna order, incrementa `lock_version`

**Verifica:** test Strapi isolato: pairing end-to-end + flow async close.

### Fase 14 — Documentazione + release (1.5g)
- `README.md` con build e dev
- `docs/INSTALL.md` per ristoratore (screenshot wizard)
- `docs/TROUBLESHOOTING.md` (stampante non trovata, token revocato, Strapi non raggiungibile)
- ADR 0001-0004
- Changelog versioni
- Release note v1.0.0

---

## 7. Sicurezza

### 7.1 Trust boundary
- Internet ↔ **solo Strapi** (HTTPS obbligatorio)
- Strapi ↔ **solo pos-rt-service** (device token autenticato)
- pos-rt-service ↔ **solo dispositivi locali** (USB/LAN)
- Nessuna porta inbound aperta sul gateway del ristoratore

### 7.2 Gestione secret
- Device token: 32 byte random, stored hashed (sha256) lato Strapi, encrypted at rest lato client
- Master key AES-256-GCM derivata via scrypt (`N=2^17, r=8, p=1`) da:
  - Salt random 32 byte (file `%ProgramData%\PosRtService\.salt`, ACL solo service account)
  - Machine fingerprint (hostname + primary MAC + OS version)
- Opzionale su Windows: salt protetto ulteriormente con DPAPI `CryptProtectData(CurrentUser)`
- Rotazione device token: endpoint `/unpair` + re-pairing

### 7.3 TLS verso Strapi
- `https://` obbligatorio (rifiutato `http://` a meno di flag esplicito `ALLOW_INSECURE=true` solo per dev locale)
- TLS 1.2 minimo
- Cert pinning opzionale (config `trusted_fingerprints[]`)

### 7.4 API locale
- Bind esclusivo a `127.0.0.1`
- Middleware che rigetta request con `remoteAddress != 127.0.0.1`
- PIN locale (6 cifre, non memorizzabile, l'admin deve conservarlo)
- CSRF: tutte le mutation richiedono header `X-Local-Pin`
- Rate limit 30 req/min per endpoint
- Nessuna UI amministrativa accessibile da LAN

### 7.5 Code signing
- `.exe` firmato con certificato Authenticode EV
- Auto-update: verifica firma prima di sostituire il binario
- Hash `.exe` pubblicato su endpoint Strapi `/pos-devices/latest-version`

### 7.6 Privilegi minimi
- Service account dedicato (non `LocalSystem`)
- ACL ristrette su `%ProgramData%\PosRtService\` (lettura/scrittura solo service account + Administrators)
- Niente elevazione runtime

### 7.7 Mitigazione leak di dati
- Log applicativi: mai payload completi, solo `event_id` e `kind`
- Payload job contiene orderDocumentId, importi, nome piatto — **no nome cliente, no indirizzo**
- GDPR minimizzazione: il servizio non scrive mai PII cliente su disco
- Log rotation 30g con overwrite sicuro opzionale

### 7.8 DoS
- Max queue size 10000 job → oltre, rifiuta nuovi enqueue con audit warning
- Disk quota audit: 500MB per file, rotation a 10 file = max 5GB
- Timeout driver configurabile (default 30s) per evitare deadlock

---

## 8. Compliance fiscale italiana

### 8.1 Registratore Telematico (RT)
- Obbligo dal 01/01/2020 per commercianti
- Il servizio **non sostituisce l'RT**: lo pilota
- Il driver RT deve usare **hardware certificato AE** (Epson FP-90III, Custom Q3X, Olivetti, RCH, Axon Hub)
- Ogni modello ha SDK/protocollo proprio → driver dedicato in `drivers/printer/`
- **v1:** stub + interfaccia. Scontrino **di cortesia** ESC/POS funzionante (non fiscale)
- **v2:** integrazione reale modello per modello, ciascuna richiede test su device certificato e validazione documentata dal produttore

### 8.2 Corrispettivi telematici
- L'invio giornaliero all'AE è **fatto dall'RT** direttamente (protocollo AE)
- Noi manteniamo copia locale dei corrispettivi emessi nell'`audit_log`
- Export XML conforme al tracciato corrispettivi (placeholder v1) → usato in caso di ispezione

### 8.3 Fatturazione elettronica
- Fuori scope v1
- Se richiesta v2: integrazione con intermediario SDI (es. Aruba, TeamSystem) o endpoint AE

### 8.4 Privacy (GDPR)
- Titolare del trattamento: **ristoratore** (data controller)
- Responsabile del trattamento: **sviluppatore del servizio** (data processor) → richiede **DPA** (Data Processing Agreement)
- Informativa privacy mostrata all'installazione (checkbox accettazione)
- Dati persistiti minimizzati (no PII)
- Right-to-erasure: endpoint `POST /admin/wipe-data` (richiede PIN + conferma esplicita)
- Data breach notification: procedure documentate (a carico del distributore)

### 8.5 Distribuzione software
- Necessaria **P.IVA** del soggetto che distribuisce
- Dichiarazione di conformità alle norme fiscali vigenti (se il software è marketing come "soluzione fiscale")
- Termini di servizio e licenza da far accettare all'installazione

### 8.6 Audit trail
- `audit_log` con hash chain → prova di integrità
- Retention 10 anni per operazioni fiscali (obbligo civile art. 2220 c.c. + fiscale)
- Retention 12 mesi per log tecnici non fiscali

---

## 9. Rischi e mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Strapi down | media | alto | coda persistente, retry, notifica UI locale, fallback a operazione manuale |
| Dispositivo stampante offline | media | medio | fallback stampa PDF su disco, alert su dashboard |
| Macchina offline permanentemente | bassa | alto | TTL job 24h, DLQ, alert via email (config utente) |
| Chiave crypto persa | bassa | alto | re-pairing autenticato con credenziali Strapi |
| MITM su canale Strapi | bassa | alto | HTTPS forzato + cert pinning opzionale |
| Tampering audit log | bassa | alto | hash chain verificabile offline |
| RT non certificato | media | critico | driver RT reali solo post-certificazione modello, v1 espone solo stub |
| Device token leak | bassa | alto | revoca immediata via UI Strapi + hash server-side |
| Installer non firmato | alta senza cert | medio | acquisto cert Authenticode EV parte del go-live |
| Malfunzione aggiornamento | media | alto | rollback automatico se healthcheck post-update fallisce |
| Disco pieno | media | medio | monitor free space + alert; audit rotation obbligatoria |

---

## 10. Metriche di successo

- Uptime pairing > 99%
- Latenza job (ricezione → ack) con WS connesso: p50 < 1s, p95 < 3s
- Latenza job in fallback polling: p95 < 15s
- Zero perdita di job (ack-guaranteed, idempotency enforced)
- Ripresa da Strapi down: auto entro 5s dopo ritorno
- Zero job duplicati in condizioni di riconnessione WS
- Audit chain integra al 100% su test mensile in produzione

---

## 11. Timeline riassunto

| Fase | Durata | Dipendenze |
|---|---|---|
| 0 Bootstrap | 1g | — |
| 1 Storage | 2g | 0 |
| 2 Pairing | 1g | 1, 13.1 |
| 3 HTTP sync | 2g | 1, 13.2 |
| 4 WS client | 2g | 1, 13.3 |
| 5 Queue | 2g | 1 |
| 6 Scheduler | 1g | 3, 4, 5 |
| 7 Drivers | 3g | 1 (parallela a 2-6) |
| 8 Moduli business | 2g | 5, 7 |
| 9 API locale | 1.5g | 2, 6 |
| 10 Audit | 2g | 1, 8 |
| 11 Packaging | 2g | 0-10 |
| 12 Testing | 3g | 0-11 |
| 13 Strapi changes | 2g | — (parallela a 2-5) |
| 14 Docs + release | 1.5g | tutto |

**Totale dev:** ~28 giorni-uomo + buffer 20% ≈ **34 giorni**.
**Esterni:** acquisto cert Authenticode EV (2-4 settimane lead time), revisione legale DPA/informativa.

---

## 12. Prossimi passi immediati

1. Approvazione del piano
2. Fase 0 — Bootstrap (`package.json`, struttura, logger, config)
3. In parallelo: Fase 13.1 — content type `pos-device` in Strapi
4. Fase 1 — Storage + crypto
5. Milestone 1: pairing funzionante end-to-end (fasi 0-2 + 13.1)
