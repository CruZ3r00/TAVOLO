## WORKFLOW ORCHESTRATION
  ### 1. Plan Mode Default
  - Enter in plan mode for ANY non-trivial task (3+ steps or architectural decisions)
  - If something goes sideways, STOP and replan immediately
  - Use plan mode for verification steps, not just building
  - Write detailed specs upfront to reduce ambiguity
  ### 2. Subagent strategy
  - Use subagent (starting with PMO) to keep the main context clean
  - Offload research, exploration and parallel analysis to subagents
  - Decide by yourself when it is needed more compute and start team agent
  - One task per sub-agent, also if you need to start multiple backend agent (or others) for focused execution
  ### 3. Self-improvement loop
  - After ANY correction from the user: update lessons.md with the pattern
  - After ANY bug or error in your own code: update lessons.md with the pattern
  - Write rules for yourself that prevent the same mistake
  - ruthlessly iterate on these lessons until mistake rate drops
  - Review lessons.md on start for relevant project
  ### 4. Verification before done
  - Never mark a task complete without proving it works
  - Diff behaviour between main and your changes when relevant
  - Ask yourself: "Would a staff engineer approve this?"
  - Run tests, check logs, demonstrate correctness
  ### 5. Demand Elegance
  - For non-trivial changes: pause and ask: "is there a more elegant way?"
  - If a fix feels hacky: "Knowing everything i know now, implement the elegant solution"
  - Skip this for simple, obvious fixes -- DO NOT over-engineer
  - Challenge your own work before presenting it
  ### 6. Autonomous bug fixing
  - When given a bug report: just fix it. Don't ask for hand-holding
  - Point at logs, errors, failing tests -- then resolve them
  - Zero context switching required from the user
  - Go fix failing CI tests without told how
## TASK MANAGEMENT
  1. *CONTEXT FRIENDLY*: Read the context from code-review-graph when possible or from CLAUDE.md in the projects
  2. *PLAN FIRST*: Write plan to todo.md with checkable items
  3. *VERIFY PLAN*: Check in before starting implementation
  4. *TRACK PROGRESS*: Mark items complete as you go
  5. *EXPLAIN CHANGES*: High-level summary at each step
  6. *DOCUMENT RESULTS*: Add review section to todo.md
  7. *CAPTURE LESSONS*: Update lessons after corrections
##CORE PRINCIPLES
  - *Simplicity First*: Make every change as simple as possible. Impact minimal code.
  - *No laziness*: Find root causes. No temporary fixes. Senior developer standards
  - *Minimal Impact*: Only touch what's necessary. No side effects with new bugs
## Constraints (hard rules)
1. **Autonomous HTTP service.** This is a standalone Node.js daemon, not a library.
2. **No code sharing with the monorepo.** Do NOT `require`/`import` anything from sibling dirs (`strapi/`, `vuejs/`, `ocr-service/`, `test-site/`), and do NOT let those dirs import from here. The contract with Strapi is HTTP/WS only.
3. **Independent build.** This service has its own `package.json`, `node_modules/`, `dist/`, and packaging pipeline (`@yao-pkg/pkg`). Don't reuse the root project's tooling.
4. **Outbound-only networking.** All connections to Strapi are client-initiated (WS + HTTP). The local API binds to loopback only — see `src/app.js` `_startApi` ALLOWED_HOSTS check.
## Commands
```bash
npm install                # install deps (better-sqlite3 may need a C++ toolchain)
npm run dev                # NODE_ENV=development node src/main.js
npm run start              # production start
npm run migrate            # apply SQL migrations (also runs at boot)
npm test                   # node --test for tests/unit/**/*.test.js
npm run lint               # eslint src/ scripts/ tests/
npm run format             # prettier write
# Single-file test
node --test tests/unit/queue-manager.test.js
# Cross-platform binary build (singolo .exe / binary)
npm run pack:linux         # → dist/linux/pos-rt-service
npm run pack:macos         # → dist/macos/pos-rt-service-{x64,arm64}
npm run pack:win           # → dist/win/pos-rt-service.exe (vedi note cross-target sotto)
npm run pack:all
node scripts/build.js      # auto-detects host platform and runs the right pack

# MSI Windows (richiede wixl/msitools su Linux, o WiX Toolset su Windows)
./installer/windows/build-msi.sh    # → dist/win/pos-rt-service-<version>.msi
```

**Cross-target Windows da Linux**: `npm run pack:win` chiama `scripts/build-win.js`, che orchestra
1. backup dei `.node` Linux di `better-sqlite3` e `keytar`,
2. download dei prebuild Windows da GitHub releases (`scripts/native-bindings.js`),
3. invocazione `pkg --targets node20-win-x64`,
4. ripristino dei `.node` Linux a fine build (anche on-error).

L'EXE da Linux **non funzionerebbe** su Windows senza questa procedura, perché `better-sqlite3` e `keytar` non distribuiscono prebuild via npm — solo via GitHub releases. Per aggiungere un nuovo native module al bundle, registralo in `scripts/native-bindings.js::listBindings()`.

Tests use the **Node built-in runner** (`node --test`) — no Jest/Mocha. They set `APP_DATA_DIR` to a `mkdtemp` path so each run gets a fresh SQLite DB.
## Architecture
The service is a **bridge daemon** between Strapi (cloud) and physical restaurant devices (receipt printer, fiscal register "RT", POS terminal). It runs locally on the restaurateur's machine, behind NAT, with **no inbound ports**. Strapi pushes jobs over a client-initiated WebSocket (with HTTP polling fallback); the daemon executes them on hardware drivers and acks back.
### Boot sequence (`src/app.js` `Application.start`)

1. `keystore.initMasterKey()` — resolves the AES-256-GCM master key. Priority: OS keystore via `keytar` (DPAPI/Keychain/libsecret) → fallback `scryptSync(fingerprint, salt)`. **Must run before any encrypted I/O.**
2. `openDb()` + `runMigrations()` — opens SQLite (WAL) at `<APP_DATA_DIR>/db/pos-rt-service.db` and applies `src/storage/migrations/*.sql` in order.
3. `loadConfig()` → `mergeDbOverrides()` — defaults (`src/config/defaults.js`) overridden by env, then by `config` table. Some keys are flagged remote-modifiable via WS `config.update`; the loader's `isRemoteModifiable` is the gate.
4. `DriverRegistry.loadAll()` — lazy-requires only the selected printer + payment driver (avoids loading native deps like `serialport` if unused). On `init()` failure the driver is wrapped in a **degraded proxy**: status reports offline, every operation throws `DRIVER_UNAVAILABLE`. The service still boots so the dashboard can reconfigure.
5. `_wireRemoteClients()` — only if device is paired. Builds `HttpClient` and `WsClient` from the persisted `device` row + decrypted `device_token`, plus `SyncService`.
6. `QueueManager` constructed with handlers `order.close` and `print.receipt`.
7. If paired → `_startScheduler()` and `wsClient.start()`. Otherwise → `ensureClaimCode()` writes a one-shot pairing token to `<APP_DATA_DIR>/.claim-code` (mode 0600).
8. `_startApi()` — Express on `127.0.0.1:<port>`. Port 0 means dynamic alloc, then persisted to `config.api.port`. **`api.host` is hard-restricted to loopback** even if a malicious WS `config.update` tries to override it.
9. `auditRepo.append({ kind: 'service.started' })`.

### Layered modules

- **`storage/`** — `db.js` (better-sqlite3 wrapper, WAL), `migrator.js` (sequential SQL files), `repositories/*` (thin DAOs around prepared statements). `secretsRepo` does AES-256-GCM at-record using the master key. `auditRepo` is **append-only hash-chained** (SQL triggers reject UPDATE/DELETE; each row stores `prev_hash` + `chain_hash`; `verifyChain()` recomputes).
- **`services/`** — long-lived singletons:
  - `httpClient` — axios + bearer auth + retry/backoff + optional cert pinning (`TRUSTED_CERT_FINGERPRINTS`).
  - `wsClient` — `ws` outbound-only, EventEmitter, exponential reconnect (`utils/backoff.js`), heartbeat ping/pong with timeout. Token goes **only in `Authorization` header**, never in URL.
  - `syncService` — `pullJobs` (HTTP, cursor-based) + `ackJob` + `heartbeat`. Idempotent enqueue via `event_id UNIQUE`.
  - `queueManager` — `p-queue` worker(s) over `job_queue`. Single-flight `dispatch()`, retry with `queueRetryDelayMs`, DLQ at `maxAttempts`. Sanitizes outcomes before audit (PII blacklist).
  - `scheduler` — `setInterval` + `node-cron`. Adaptive poll (fast when WS down, slow when up), heartbeat, WS reconnect-if-needed, releaseStuck (recovers `in_progress` rows after a crash), nightly cleanup + `auditRepo.verifyChain()`. All jobs are **single-flight** via per-name boolean lock.
- **`drivers/`** — printer (`stub`, `epson-fpmate`, `custom-xon`, `escpos-fiscal`) and payment (`stub`, `generic-ecr`, `jpos`, `escpos-bt`). Hardware bindings only; no business logic. Selection in config; **lazy require** keeps native deps optional.
- **`modules/`** — pure business handlers consumed by `QueueManager`:
  - `payment.createOrderCloseHandler` — validates payload (zod), `payment.charge` with `idempotencyKey = event_id`, then `printer.printReceipt` (or `printFiscalReceipt` if `payment_method === 'fiscal_register'`). On print-after-charge failure: best-effort auto-refund + audit. Always emits `payment.charged` / `receipt.printed` / `print.failed_after_charge` / `payment.refunded_auto` events.
  - `print.createPrintReceiptHandler` — receipt-only path.
  - `pairing` — `pair` (email+password → JWT → `register`), `pairByToken` (single-use token from Vue profile page), `unpair`. Persists `secrets.device_token` (encrypted), `device` row, `local_pin_hash` (scrypt). Re-pair blocked unless `ALLOW_RE_PAIR=true`.
- **`api/`** — Express app, **always loopback-bound** (`middleware/loopback-only.js` rejects non-127.0.0.1 sockets). Routes:
  - `/health` — public liveness.
  - `/status` — paired/ws/queue/audit/drivers snapshot.
  - `/pair`, `/pair/by-token`, `/pair/unpair` — first two require `X-Pairing-Claim-Code` header (token from `.claim-code` file); unpair requires PIN.
  - `/admin/*` — gated by `requireLocalPin` (`X-Local-Pin` header, scrypt verify, auto-rehash legacy sha256). Test print, jobs list/retry/cancel, audit list + chain verify.
  - `/ui/pair.html`, `/ui/dashboard.html` — static HTML in `src/api/ui/` served by `express.static` and bundled into the pkg binary via `pkg.assets`.
  - All routes behind `rateLimit(config.api.rateLimit)` (default 30 req / 60s).
- **`utils/`** — `crypto` (AES-GCM, scrypt, PIN hash/verify, `randomPin`), `keystore` (master key resolver), `claim-code` (one-shot pairing gate, mitigation C-3), `machine` (cross-OS appdata path + machine fingerprint), `backoff` (queue + WS reconnect schedules), `errors` (`AppError` + `CODES` map — these codes are part of the public API contract, don't rename casually), `validation` (zod schemas), `logger` (pino + pino-roll).

### Dataflow for a job

```
Strapi → WS 'job.new' (or HTTP pull) → SyncService.pullJobs
       → jobQueueRepo.enqueue (UNIQUE event_id = idempotency)
       → QueueManager.dispatch → claim row → handler(payload, {job})
       → driverRegistry.<printer|payment>.<op>
       → markDone + auditRepo.append('job.done')
       → SyncService.ackJob(event_id, 'success'|'failure', outcome)
```

WS message types handled in `Application._handleWsMessage`: `job.new`, `job.cancel`, `config.update` (filtered through `isRemoteModifiable`).

### Storage layout

- DB: `<APP_DATA_DIR>/db/pos-rt-service.db` (+ `-wal`, `-shm`)
- Logs: `<APP_DATA_DIR>/logs/`
- Salt: `<APP_DATA_DIR>/.salt` (mode 0600)
- Claim-code: `<APP_DATA_DIR>/.claim-code` (mode 0600, one-shot, deleted on successful pair)
- Keystore backend marker: `<APP_DATA_DIR>/.keystore-backend`

`APP_DATA_DIR` defaults: `%ProgramData%\PosRtService` (Windows), `~/Library/Application Support/PosRtService` (macOS), `$XDG_DATA_HOME/pos-rt-service` (Linux). Override with the `APP_DATA_DIR` env var.

## Strapi contract (HTTP/WS, v1)

The service expects these endpoints on Strapi (must exist for full functionality; `register-by-token` is the modern pairing flow):

- `POST /api/auth/local` (Strapi built-in, used by classic pair flow)
- `POST /api/pos-devices/register` → `{ device_token, ws_url?, documentId? }`
- `POST /api/pos-devices/register-by-token` (single-use pairing token, TTL 30min)
- `POST /api/pos-devices/:id/revoke`
- `GET /api/pos-devices/me/jobs?since=<cursor>&limit=` → `{ data: [{ event_id, kind, payload, priority }], meta: { next_cursor } }`
- `POST /api/pos-devices/me/jobs/:event_id/ack` body `{ result: 'success'|'failure', outcome }`
- `POST /api/pos-devices/me/heartbeat`
- `GET /api/pos-devices/me/config`
- `WS /ws/pos` with `Authorization: Bearer <device_token>` — server pushes `{ type: 'job.new'|'job.cancel'|'config.update', ... }`.

Job kinds the service handles today: **`order.close`** (charge + receipt), **`print.receipt`** (receipt only). New kinds = new entry in the `handlers` map in `app.js`.

## Conventions to keep when editing

- **Error semantics.** Throw `AppError(CODES.X, msg, { httpStatus })` from `utils/errors.js`. Codes are stable and surfaced to API consumers and audit logs — adding a new one is fine, renaming an existing one is breaking.
- **Validation at the boundary.** Use zod schemas in `utils/validation.js` (`parseOrThrow`) for any payload coming from the API or from a job. Don't trust shapes inside handlers.
- **No PII in audit meta.** `auditRepo.append({ meta })` is sanitized by `sanitizeOutcome` in `queueManager.js` (blacklist: `customer_name`, `phone`, `email`, `password`, `address`). When you add a new audit event, follow the same hygiene.
- **Single-flight everything periodic.** Scheduler jobs and `dispatch()` use a boolean lock — keep that pattern when adding new periodic work.
- **Lazy-require new drivers.** Add them to the `PRINTERS`/`PAYMENTS` map in `drivers/registry.js` as `() => require('./...')` factories, never as top-level requires. Driver `init()` failures must be survivable (the registry already wraps them in `makeDegradedProxy`).
- **Migrations are forward-only and numbered.** Add `NNN_description.sql` in `src/storage/migrations/`. The migrator (`src/storage/migrator.js`) tracks applied versions in `_meta`. SQL must be idempotent (`CREATE TABLE IF NOT EXISTS`, etc.). The `audit_log` table has triggers that **forbid UPDATE/DELETE** — don't try to mutate existing audit rows.
- **Loopback bind is non-negotiable.** `src/app.js` rejects any `api.host` outside `{127.0.0.1, ::1, localhost}`. Don't weaken this to please a config request.
- **Pairing requires the claim-code on first run.** Don't add a "skip pair gate" path. The claim-code file is the only thing protecting against a local unprivileged process pairing the device against a malicious Strapi.

## Mobile companion (`mobile/`)

`mobile/` is a **separate** Capacitor + Vue 3 + TypeScript app, NOT the Node daemon. Same role (outbound-only bridge to Strapi + LAN POS/RT) but for Android/iOS. It has its own `package.json`, `vite` config, Capacitor projects (`android/`, `ios-staging/`), and TS sources under `mobile/src/{core,drivers,plugins,services,composables,views}`. Treat it as a sibling project: same architectural rules apply (no cross-imports with the daemon), but it does not share runtime code with `src/`.

### Real POS/RT drivers (ADR-0004)

Sostituiti gli stub demo con driver reali per il mercato italiano:

| Driver | Categoria | Wire | Default port | Note |
|---|---|---|---|---|
| `italretail` | printer (RT) | XON-XOFF over TCP | 9100 | Wrapper su `customXon`, modelli Italstart/Nice/Big. Hook `protocol: 'xml7'` riservato per modelli nuovi. |
| `nexi-p17` | payment | Protocollo 17 / ECR17 | 9999 | STX/ETX/LRC framing + ACK/NAK retry + risposta differita post-PIN. Encoder `messageEncoder` pluggable per matrice-campi cliente. |
| `epson-fpmate`, `custom-xon`, `escpos-fiscal`, `generic-ecr`, `jpos` | — | — | — | Già presenti, refactorati per usare gli helper condivisi. |

**Pacchetti chiave:**

- `mobile/src/drivers/helpers/{lrc,frame,payTypeMap,idempotency}.ts` — funzioni pure condivise (testate con Vitest, 54 test).
- `mobile/src/plugins/tcpStream.ts` + `mobile/android-plugins/PosTcpStreamPlugin.kt` — sessione TCP persistente per driver con risposta differita (Nexi P17). Pattern `withSession(host, port, async (s) => {...})` con close in finally.
- `mobile/src/plugins/networkInfo.ts` + `mobile/android-plugins/NetworkInfoPlugin.kt` — CIDR locale via Wi-Fi DHCP / NetworkInterface fallback.

### LAN discovery

`mobile/src/services/discovery/*` orchestrano: subnet detection → port scan parallelo (concurrency 50, connect-only) → driver probe → ranked candidates. Esposto via composable `useDiscovery()` e view `DeviceDiscovery.vue` (route `/discovery`).

### Idempotency persistita

`mobile/src/core/idempotency.ts` espone `persistedIdempotencyStore` (Preferences-backed). `jobHandlers.ts::handleOrderClose` esegue WAL: `setPending` → `charge` → `markCompleted`/`markFailed`. Su retry stesso `event_id`: completed → outcome cached; pending → `driver.inquiry?` (Nexi P17 implementato); failed → re-fire libero. Driver senza Inquiry e record pending → `INQUIRY_UNSUPPORTED` (verifica manuale). GC giornaliero al boot dello scheduler.

### Plugin nativi Android (registrazione)

I plugin `.kt` vivono in `mobile/android-plugins/` e sono copiati in `mobile/android/app/src/main/java/it/posrtservice/mobile/plugins/`. Registrati in `MainActivity.java`:
- `PosForegroundServicePlugin` — foreground service per uptime in background
- `PosTcpSocketPlugin` — TCP one-shot (sendOnce + probePort)
- `PosTcpStreamPlugin` — TCP session-based (open/send/recv/close)
- `NetworkInfoPlugin` — CIDR locale

Gradle: Kotlin 1.9.22 + kotlinx-coroutines-android 1.7.3 (vedi `android/variables.gradle` + `android/app/build.gradle`).

### Test e mock

```bash
cd mobile && npm test            # 54 unit test (Vitest)
node tests/fixtures/mock-italretail-server.cjs 9100
node tests/fixtures/mock-nexi-p17-server.cjs 9999 [--decline-rate=0.5] [--pin-delay=8000]
```

I mock TCP simulano i wire reali per smoke test su device fisico (collega l'app alla LAN del laptop) o per test di idempotency end-to-end ("kill-after-charge"). Vedi `tests/fixtures/README.md`.



**Android release signing**: keystore in `~/.android/posrtmobile-release.jks` (mode 0600, NOT in repo). Credenziali in `mobile/android/keystore.properties` (gitignored), lette da `mobile/android/app/build.gradle` per la `signingConfigs.release`. APK firmato v1+v2+v3 via `./gradlew assembleRelease`, AAB via `bundleRelease`. R8/ProGuard `minifyEnabled=false` (Capacitor reflection-heavy) — TODO post-MVP attivare con keep-rules curate. Icon set: glifo "T" bianco geometrico su `#1E3A5F` (background brand), generabile via `tmp/gen_launcher_icons.py` se serve rigenerare.

## Windows installer (`installer/windows/`)

MSI buildato con `wixl` (msitools) da Linux o WiX Toolset 3+ da Windows. Layout modulare in `installer/windows/wix/`: `Variables.wxi` (UpgradeCode, GUID), `Directories.wxs`, `Components.wxs`, `Service.wxs` (binario+ServiceInstall), `Product.wxs`. Build: `./installer/windows/build-msi.sh`. Install lato utente: `installer/windows/install.ps1` (auto-elevate, msiexec + `Configure-PosRtService.ps1` per ACL stretta DataDir + REG_MULTI_SZ Environment + recovery actions). Vedi `installer/windows/README.md` per dettagli, troubleshooting, Authenticode signing.

**Limitazione wixl 0.101**: non supporta `util:PermissionEx`, `MultiStringValue`, `util:ServiceConfig`. Quei tre aspetti (ACL, env vars, recovery) sono delegati a `Configure-PosRtService.ps1`. Per build con WiX nativo su Windows si possono nativizzare nel MSI — vedi commenti TODO nei `.wxs`.

## Reference docs

- `README.md` — user-facing dev quickstart, install, pairing flow, security summary.
- `docs/PLAN.md` — full design doc (~34k chars) covering threat model, packaging, Strapi contract, future driver plans.
- `docs/INSTALL.md` — end-user (restaurateur) installation guide per OS.
- `installer/windows/README.md` — Windows installer build, signing, troubleshooting.
- `../docs/adr/0003-pos-rt-service.md` (in monorepo root) — the ADR that introduced this service.
- `todo.md` — current implementation backlog.
