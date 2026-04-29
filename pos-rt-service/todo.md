# pos-rt-service — Todo operativo

Riferimento: `docs/PLAN.md` (piano completo). Questa è la checklist per tracciare l'avanzamento.

## Fase 0 — Bootstrap
- [ ] `package.json` con dipendenze pinned e script (`dev`, `start`, `build`, `migrate`, `test`, `lint`)
- [ ] `.gitignore`, `.eslintrc.json`, `.prettierrc`, `.editorconfig`
- [ ] Struttura cartelle `src/` come da PLAN §3
- [ ] `src/utils/logger.js` (pino + rotation)
- [ ] `src/config/defaults.js` + `src/config/loader.js`
- [ ] `src/main.js` + graceful shutdown (SIGINT/SIGTERM)
- [ ] `src/utils/errors.js` classe `AppError` con `code`, `httpStatus`
- [ ] `.env.example`

## Fase 1 — Storage
- [ ] `src/storage/db.js` — wrapper `better-sqlite3` (WAL, pragma)
- [ ] `src/storage/migrator.js` — apply sequenziale di file `.sql`
- [ ] `src/storage/migrations/001_init.sql`
- [ ] `src/storage/migrations/002_audit_chain.sql`
- [ ] `src/utils/crypto.js` — AES-256-GCM encrypt/decrypt + KDF scrypt
- [ ] `src/utils/machine.js` — fingerprint + hook DPAPI
- [ ] `src/storage/repositories/configRepo.js`
- [ ] `src/storage/repositories/secretsRepo.js` (cifratura trasparente)
- [ ] `src/storage/repositories/deviceRepo.js`
- [ ] `src/storage/repositories/jobQueueRepo.js`
- [ ] `src/storage/repositories/auditRepo.js` (append + verifyChain)
- [ ] `src/storage/repositories/syncStateRepo.js`
- [ ] Unit test: crypto round-trip, audit chain append + tamper detection, queue idempotency

## Fase 2 — Pairing
- [ ] `src/modules/pairing/index.js`
- [ ] `src/api/routes/pair.js` (abilitata solo se `device` row assente)
- [ ] UI HTML `src/api/ui/pair.html` (form wizard + logo)
- [ ] Integrazione `POST /api/auth/local` Strapi + `POST /api/pos-devices/register`
- [ ] Salvataggio cifrato `device_token` + `strapi_url`
- [ ] Generazione `local_pin` (mostrato una volta)
- [ ] Disabilitazione route `/pair` dopo successo

## Fase 3 — HTTP client + sync
- [ ] `src/services/httpClient.js` (axios + auth header + retry + timeout)
- [ ] `src/services/syncService.js` — `pullJobs()`, `ackJob()`, cursor
- [ ] Integration test con Strapi mock

## Fase 4 — WebSocket client
- [ ] `src/services/wsClient.js` (stato + reconnect + ping/pong)
- [ ] Handler eventi `job.new`, `job.cancel`, `config.update`
- [ ] Backoff 1/2/4/8/15/30s con jitter 25%
- [ ] Test con WS mock server (disconnect, invalid token)

## Fase 5 — Queue manager
- [ ] `src/services/queueManager.js` — enqueue, dispatch, retry, DLQ
- [ ] Concurrency control con `p-queue`
- [ ] Audit su ogni transizione stato
- [ ] Test: 100 enqueue duplicati → 0 duplicati; 1 job fallimento permanente → DLQ dopo 6 tentativi

## Fase 6 — Scheduler
- [ ] `src/services/scheduler.js` con `node-cron`
- [ ] Job `pull-jobs`, `retry-failed`, `heartbeat`, `reconnect-ws`, `cleanup-old-jobs`, `verify-audit-chain`
- [ ] Single-flight lock per job
- [ ] Test chaos: kill WS → polling intensifica; restore → polling torna normale

## Fase 7 — Driver layer
- [ ] `src/drivers/printer/base.js` interfaccia
- [ ] `src/drivers/printer/stub.js`
- [ ] `src/drivers/printer/escpos.js` (USB + network)
- [ ] `src/drivers/printer/epson-fp90.js` (stub + interfaccia seriale)
- [ ] `src/drivers/payment/base.js`
- [ ] `src/drivers/payment/stub.js`
- [ ] `src/drivers/payment/sumup.js` (stub)
- [ ] `src/drivers/registry.js` — loader da configRepo
- [ ] Template engine scontrino ESC/POS
- [ ] Test stampa reale su USB (manuale)

## Fase 8 — Moduli business
- [ ] `src/modules/print/index.js` — mapping job → driver print
- [ ] `src/modules/payment/index.js` — mapping job → driver payment + idempotency
- [ ] Flusso `order.close`: charge → print → ack
- [ ] Rollback automatico su print-failure dopo charge OK
- [ ] Validazione payload con zod

## Fase 9 — API locale admin
- [ ] `src/api/index.js` express app su 127.0.0.1:ALLOCATED_PORT
- [ ] Middleware `loopback-only.js`
- [ ] Middleware `local-auth.js` (header `X-Local-Pin`)
- [ ] Rate limiter 30/min
- [ ] Routes: health, status, pair, unpair, test-print, jobs/retry, jobs/cancel, logs, audit
- [ ] UI HTML dashboard (`/ui/dashboard.html`, `/ui/pair.html`) — vanilla JS
- [ ] CSRF (header `X-Local-Pin` su mutation)
- [ ] Test: loopback-only enforcement, PIN required

## Fase 10 — Audit & compliance
- [ ] `src/storage/repositories/auditRepo.js` già implementato in Fase 1
- [ ] Endpoint `GET /audit` con filtri
- [ ] Export XML corrispettivi giornaliero (placeholder)
- [ ] Policy retention 10y fiscale / 12m tecnico (integrata in `cleanup-old-jobs`)
- [ ] Test: tampering audit → verifyChain riporta mismatch

## Fase 11 — Packaging Windows
- [ ] `scripts/build.js` (prep bundle)
- [ ] `scripts/pack.js` (@yao-pkg/pkg)
- [ ] `installer/nsis/installer.nsi` (wizard + service + firewall loopback)
- [ ] `installer/service/install.js` (node-windows)
- [ ] `scripts/sign.js` (signtool)
- [ ] Acquisto cert Authenticode EV (esterno, lead time 2-4 settimane)
- [ ] Flusso auto-update con verifica firma
- [ ] Test su VM Windows 11 pulita

## Fase 12 — Testing
- [ ] Unit: crypto, audit, queue, backoff, sync, ws
- [ ] Integration: pairing end-to-end, pull+dispatch+ack con mock Strapi
- [ ] E2E: contro Strapi staging reale (env var `STRAPI_URL_E2E`)
- [ ] Load: 1000 job, concurrency 5, zero loss
- [ ] Chaos: kill Strapi/DB/network durante flow

## Fase 13 — Modifiche Strapi (parallela)
> Lavoro fuori da `pos-rt-service/`, dentro `strapi/`.

### 13.1 Content type `pos-device`
- [ ] `strapi/src/api/pos-device/content-types/pos-device/schema.json`
- [ ] Controller `register`, `revoke`
- [ ] Routes `POST /api/pos-devices/register`, `POST /api/pos-devices/:id/revoke`

### 13.2 Middleware device-token
- [ ] `strapi/src/middlewares/device-token.js`
- [ ] Applicato a rotte `/api/pos-devices/me/*`
- [ ] Verifica `sha256(header) == device_token_hash`, setta `ctx.state.device`

### 13.3 Runtime endpoint device
- [ ] `GET /api/pos-devices/me/jobs?since=&limit=`
- [ ] `POST /api/pos-devices/me/jobs/:event_id/ack`
- [ ] `POST /api/pos-devices/me/heartbeat`
- [ ] `GET /api/pos-devices/me/config`

### 13.4 Schema pos_jobs
- [ ] Knex migration per tabella `pos_jobs` (id, event_id UNIQUE, fk_device, fk_order, kind, payload, status, created_at, updated_at)

### 13.5 WebSocket server
- [ ] Montaggio `ws` server su Strapi bootstrap hook
- [ ] Auth via `device_token` in upgrade request
- [ ] Dispatcher eventi `job.new`
- [ ] Listener `ack`, `heartbeat`

### 13.6 Close order estensione
- [ ] Rilevamento `payment_method in ('pos','fiscal_register')` + device attivo
- [ ] Creazione `pos_job` + marcatura `order.fiscal_status='pending'`
- [ ] Push WS se device connesso
- [ ] Ritorno `202 Accepted` con `fiscal_event_id`
- [ ] Handler ack → aggiorna order, incrementa `lock_version`

### 13.7 Frontend adattamento
- [ ] `vuejs/frontend/src/Pages/Orders.vue`: gestione stato "in attesa fiscale"
- [ ] `vuejs/frontend/src/utils.js`: polling `fiscal_status` post-close
- [ ] Gestione errori nuovi: `FISCAL_DEVICE_OFFLINE`, `FISCAL_TIMEOUT`

## Fase 14 — Documentazione + release
- [ ] `README.md` build e dev
- [ ] `docs/INSTALL.md` guida ristoratore (screenshot)
- [ ] `docs/TROUBLESHOOTING.md`
- [ ] `docs/adr/0001-outbound-only-architecture.md`
- [ ] `docs/adr/0002-storage-and-crypto.md`
- [ ] `docs/adr/0003-queue-and-idempotency.md`
- [ ] `docs/adr/0004-fiscal-compliance.md`
- [ ] `CHANGELOG.md`
- [ ] Release note v1.0.0

## Esterni (parallelo)
- [ ] Acquisto certificato Authenticode EV
- [ ] Redazione DPA (Data Processing Agreement)
- [ ] Redazione informativa privacy + termini di servizio
- [ ] Verifica dichiarazione di conformità fiscale

## Review finale
- [ ] Code review completa contro ADR
- [ ] Security review (threat model completo)
- [ ] Compliance review (fiscalista + legale)
- [ ] Dry-run installazione su macchina target reale
