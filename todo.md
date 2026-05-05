# Plan — Verify Owner Tabs And Department Category Editing (2026-05-05)

## Obiettivo

Verificare e correggere due regressioni funzionali: i tab owner dentro `Ordini` devono navigare davvero tra `Cucina`, `Bar`, `Pizzeria`, `Cucina SG`; nella scheda Profilo > Reparti le categorie assegnate devono essere modificabili quando il piano lo consente, oppure mostrare chiaramente se il blocco dipende da assenza dati/piano.

## Checklist

- [x] Controllare router/guard/staff roles delle rotte dei reparti produttivi.
- [x] Correggere il click dei tab owner e verificare che punti a una navigazione router esplicita.
- [x] Controllare payload account/staff e form Reparti per categorie modificabili.
- [x] Correggere modifica/salvataggio categoria -> reparto se il problema e nel codice.
- [x] Verificare con controlli disponibili, distinguendo cio che non puo essere testato senza runtime.

## Review

- `git diff --check` OK.
- Le rotte `/kitchen`, `/bar`, `/pizzeria`, `/kitchen-sg` includono `STAFF_ROLES.OWNER` e hanno `ordersMode` dedicato.
- I tab owner in `Orders.vue` ora sono bottoni come nella pagina profilo e chiamano `router.push(...)` tramite `switchOwnerOrderMode`.
- La scheda Reparti ora espone piano/motivo blocco ricevuti dal backend e usa il ruolo effettivo della categoria nel select.
- Non ho potuto fare login/API/browser end-to-end: Strapi non risponde su `localhost:1337` o `localhost:1437`, e `npm`/`node` non sono disponibili nel PATH nemmeno con esecuzione fuori sandbox.


# Plan — Strapi SSL CA Startup Fix (2026-05-05)

## Obiettivo

Evitare che `npm run dev` di Strapi fallisca quando `DATABASE_SSL_CA` punta a un certificato locale non presente sulla macchina di sviluppo.

## Checklist

- [x] Verificare causa in `strapi/config/database.js`.
- [x] Rendere opzionale il file CA senza disattivare SSL.
- [x] Verificare sintassi/config con gli strumenti disponibili.

## Review

- `git diff --check` OK.
- `node` non disponibile nel `PATH` di questo ambiente, quindi non ho potuto fare un require diretto del config. La macchina dell'utente ha `npm`, quindi puo rilanciare `npm run dev`.

## Follow-up

- [x] Gestire anche `self-signed certificate in certificate chain` quando manca il CA in sviluppo.
- [x] Evitare warning `fs.existsSync` con tipi non stringa.
- [x] Mantenere errore esplicito in produzione se `DATABASE_SSL_CA` punta a un file assente.
- [x] Rimuovere l'hard-fail automatico basato su `NODE_ENV`; il fail ora richiede `DATABASE_SSL_FAIL_ON_MISSING_CA=true`.

# Plan — Persistent Category Routing By Department (2026-05-05)

## Obiettivo

Rendere persistente l'assegnazione delle categorie ai reparti: classificazione automatica solo al primo inserimento, modifica manuale dalla pagina Reparti, override sempre a Cucina per piano Essenziale/Starter, cameriere sempre attivo e non disattivabile.

## Checklist

- [x] Mappare routing categorie, account reparto e vincoli piano.
- [x] Centralizzare la logica backend di routing categorie.
- [x] Aggiungere API per leggere/salvare assegnazioni categoria -> reparto.
- [x] Aggiornare pagina Reparti con categorie spostabili tra reparti.
- [x] Correggere filtro ordini per Starter/Pro.
- [x] Verificare con controlli disponibili.

## Review

- `git diff --check` OK.
- `npm run build` non eseguibile in questo ambiente: `npm` non e disponibile nel `PATH`.
- Aggiunta patch SQL opzionale in `docs/sql/category_routing_manual_assignments_patch.sql`.

# Plan — Owner Orders Navigation (2026-05-05)

## Obiettivo

Rendere la navigazione owner piu semplice: sidebar desktop e bottom navbar mobile racchiudono in `Ordini` solo i reparti produttivi (`Cucina`, `Bar`, `Pizzeria`, `Cucina SG`), mentre `Manager`, `Sala`, `Prenotazioni` e `Menu` restano sezioni autonome. I reparti produttivi vengono scelti una alla volta da tab in testata pagina con lo stile del profilo. Le viste dedicate agli staff restano invariate.

## Checklist

- [x] Verificare struttura corrente di sidebar, bottom nav e pagina ordini.
- [x] Limitare la nav del ruolo owner a un solo item `Ordini` per i reparti produttivi.
- [x] Lasciare `Manager`, `Sala`, `Prenotazioni` e `Menu` come item owner separati.
- [x] Aggiungere tabs owner in `Orders.vue` per Cucina, Bar, Pizzeria e Cucina SG.
- [x] Verificare con gli strumenti disponibili.

## Review

- `git diff --check` OK.
- `npm run build` non eseguibile in questo ambiente: `npm`/`node` non sono disponibili nel `PATH`.
- Diff controllato sui file modificati; le viste staff mantengono la lista precedente per ruolo e la scheda owner `Ordini` include solo i reparti produttivi.

# Plan — POS/Cassa Fiscale Integration (PC + Mobile)

> **Scope ratificato con l'utente** (sessione 2026-04-26):
> - Servizio locale outbound-only verso Strapi (polling HTTP 10s, backoff fino a 60s)
> - Stesso comportamento su PC Windows e su mobile (iOS/Android)
> - iOS wake-up via **APNs silent push** (mini-aggiunta lato Strapi)
> - Android: Foreground Service con notifica permanente
> - Solo protocolli **aperti**: niente SDK proprietari
>   - POS: ECR generico (TCP), JPOS, ESC/POS via TCP/BT
>   - RT: Epson FPMate (XML/HTTP), Custom XON, ESC/POS-fiscal
> - Stampa scontrino fiscale = la fa direttamente l'RT, il servizio invia solo il comando
> - Servizio completamente **isolato**: niente import/share dal frontend Vue. Componenti = copia-incolla
> - Distribuzione: link diretti dalla pagina profilo, sezione "Configura POS/Cassa fiscale"

---

## Stato attuale (verificato)

- **Working tree corrente**: solo `pos-rt-service/node_modules/` (vuoto di sorgenti)
- **Branch backup `claude-backup-20260425-035100`** (commit `5826b0b`):
  - 68 file in `pos-rt-service/` (daemon Node.js, design completo)
  - 11 file Strapi (`pos-device`, `pos-job`, `pos-bridge`, `device-token` middleware, `order-close-finalizer`)
  - `docs/adr/0003-pos-rt-service.md` (design ratificato)
- **Già fatto nel backup**: polling 10s, device token auth, audit chain, queue persistente SQLite, pairing flow, dashboard loopback
- **Stubs (da implementare)**: `drivers/payment/stub.js`, `drivers/printer/stub.js`
- **Mai implementato**: runtime mobile, APNs, driver reali

---

## Fase 0 — Foundation (recovery + security hardening) ✅ DONE 2026-04-26

**Obiettivo**: tornare al punto di partenza solido prima di estendere.

- [x] **0.1** Ripristinare i sorgenti dal backup
- [x] **0.2** Verificare che il servizio compili: `npm install` OK, `pkg` build OK, 20/20 unit test verdi
- [x] **0.3** Apply CRITICAL fixes (dal report security 2026-04-25)
  - [x] **C-1** XSS dashboard: rendering DOM-safe via `createElement` + `textContent`, mai `innerHTML` con dati dinamici
  - [x] **C-2** WS `config.update` whitelist: `REMOTE_MODIFIABLE_KEYS` in `config/loader.js`, audit log delle chiavi rifiutate
  - [x] **C-3** Claim-code anti-hijack: `src/utils/claim-code.js` + header `X-Pairing-Claim-Code` su `POST /pair`, file 0600 in DataDir, one-shot consume
  - [x] **C-4** Master key in OS keystore via `keytar`: nuovo `src/utils/keystore.js` con backend `os-keystore` e fallback `fallback-scrypt` segnalato in log
  - [x] **C-5** Cert pinning: `tls.checkServerIdentity` chiamato prima del fingerprint check
- [x] **0.4** Apply HIGH fixes
  - [x] **H-1** PIN scrypt + per-record salt, formato `scrypt$<salt>$<hash>`, auto-migrazione da legacy SHA256
  - [x] **H-2** Device token solo in header WS `Authorization: Bearer`, rimosso fallback in URL query
  - [x] **H-5** Bind allow-list `{127.0.0.1, ::1, localhost}`, throw all'avvio se diverso
- [x] **0.5** Smoke test: service parte su 127.0.0.1, claim-code gate respinge 401 senza/con claim errato, accetta con claim corretto
- **Nota dipendenze**: aggiunto `keytar` a `package.json` (~2 packages). Su Linux headless senza libsecret il modulo va in fallback `scrypt` in modo grazioso. Su Windows/macOS produzione userà OS keystore nativo.
- **File modificati**: `src/api/ui/dashboard.html`, `src/api/ui/pair.html`, `src/api/routes/pair.js`, `src/api/middleware/local-auth.js`, `src/services/httpClient.js`, `src/services/wsClient.js`, `src/config/loader.js`, `src/app.js`, `src/utils/crypto.js`, `src/utils/errors.js`, `src/modules/pairing/index.js`, `src/utils/keystore.js` (NEW), `src/utils/claim-code.js` (NEW), `tests/unit/crypto.test.js`, `tests/unit/storage.test.js`, `package.json`, `package-lock.json`

---

## Fase 1 — Driver generici reali (PC desktop) ✅ DONE 2026-04-27

**Obiettivo**: `payment_method: pos`/`fiscal_register` smettono di essere stub.

### 1.1 — Driver Pagamento POS generico

- [x] **1.1.1** `src/drivers/payment/generic-ecr.js` — OPI XML su TCP, length-prefixed 4-byte ASCII, charge/refund/diagnosis/status, idempotency cache. **Test**: 3 unit (success/declined/timeout) con mock TCP server.
- [x] **1.1.2** `src/drivers/payment/jpos.js` — ISO-8583 lite, MTI 0200/0210/0220/0230/0800/0810, 9 campi BCD, encoder/decoder esposto. **Test**: 4 unit (round-trip, invalid MTI, charge/decline).
- [x] **1.1.3** `src/drivers/payment/escpos-bt.js` — serial via porta virtuale BT. `serialport` come optionalDependency (lazy require). Comando ESC P/R/S, parsing OK/KO line-based.
- [ ] **1.1.4** Discovery LAN/mDNS — RIMANDATO a fase successiva (UI dashboard).

### 1.2 — Driver Cassa Fiscale (RT)

- [x] **1.2.1** `src/drivers/printer/epson-fpmate.js` — XML SOAP su HTTP/HTTPS (porta 80), `printerFiscalReceipt` con `printRecItem` + `printRecTotal` + `endFiscalReceipt`, mapping `payment_method` → `paymentType` (0=cash, 2=card, 3=meal_voucher, 4=other). **Test**: 4 unit (XML build correct, error parsing, status, payment_method mapping).
- [x] **1.2.2** `src/drivers/printer/custom-xon.js` — TCP ASCII, sequenze ESC%opcode|args|...ETX. Open/Item/Total/Close fiscale, scontrino non-fiscale, query stato.
- [x] **1.2.3** `src/drivers/printer/escpos-fiscal.js` — fallback generico per RT con dialetto ESC/POS esteso. Frame ESC|opcode + ETB-separated args.
- [ ] **1.2.4** Mapping comune `emitReceipt({...})` — i 3 driver implementano lo stesso contratto `printFiscalReceipt(data)` (deferred from base class).
- [ ] **1.2.5** Discovery RT in LAN — RIMANDATO.

### 1.3 — Wire-up moduli

- [x] **1.3.1** `src/modules/payment/index.js` — usa `driverRegistry.payment` invariato (logica già fatta nel backup).
- [x] **1.3.2** `src/modules/print/index.js` — `driverRegistry.printer.printFiscalReceipt()` invariato.
- [x] **1.3.3** Configurazione driver in `config/defaults.js` con blocchi placeholder (host=null) per ogni driver. Edit via configRepo / dashboard locale.
- [x] **1.3.4** `drivers/registry.js`: registrazione lazy dei 6 driver + degraded-proxy fallback se init fallisce → servizio parte sempre, dashboard mostra `degraded: true` con motivo.

### 1.4 — Bonus: driver registry resilience

- [x] **1.4.1** Init fallita non blocca lo startup. Driver wrappato in proxy che:
  - `getStatus` → `{ online: false, degraded: true, error: <reason> }`
  - operazioni → `DRIVER_UNAVAILABLE` con reason
  - `dispose` → no-op safe
- [x] **1.4.2** Smoke test: PRINTER_DRIVER=epson-fpmate + PAYMENT_DRIVER=generic-ecr senza host → service parte, /status reporta degraded entrambi, NO crash.

**Stato test**: 32/32 verdi (20 base + 12 driver new).
**File aggiunti**: 6 driver + 3 test driver + `tests/unit/drivers/`. Modificati: `registry.js`, `defaults.js`, `package.json` (+ `optionalDependencies: serialport`).

---

## Fase 2 — APNs silent push wake-up (per iOS) ✅ DONE 2026-04-27 (lato Strapi)

**Obiettivo**: su iOS, quando Strapi crea un nuovo `pos-job`, il device viene svegliato in <5s e fa polling singolo.

### 2.1 — Lato Strapi ✅

- [x] **2.1.1** Schema `pos-device`: nuovi campi `platform` (enum windows|macos|linux|ios|android|other, default "other"), `apns_token` (string private, max 200 char), `apns_token_updated_at` (datetime private)
- [x] **2.1.2** Endpoint `PATCH /api/pos-devices/me/push-token` (auth via X-Device-Token), body `{ apns_token, platform }`. Validazione hex + length 32..200. Supporta clear con `apns_token: null`.
- [x] **2.1.3** `services/pos-bridge/dispatchJob`: dopo create job, se `delivered_via_ws === 0 && device.platform === 'ios' && device.apns_token` → fire-and-forget silent push. Errori APNs catchati e loggati, NO impatto su create job.
- [x] **2.1.4** Lib `@parse/node-apn` (mantenuto, fork del `node-apn` originale). Env vars: `APNS_KEY_PATH`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRODUCTION` (bool).
- [x] **2.1.5** Payload silent push: `contentAvailable: true`, `priority: 5`, `topic: APNS_BUNDLE_ID`, `expiry: now+60s`, payload custom `{ jobHint: 1, event_id }`.
- [x] **2.1.6** Rate limit per device: `Map<deviceId, lastSentAt>` con soglia 5s. Push entro 5s dall'ultimo → skip con reason `rate limit`.
- [x] **2.1.7** No-op grazioso: se anche solo una env var manca o il file `.p8` non esiste → `isEnabled()` ritorna false → push skippato silenziosamente. Strapi continua a funzionare.
- [x] **2.1.8** `.env.example` aggiornato con sezione APNs documentata.

### 2.2 — Lato app iOS — DEFERRED a Fase 4

- [ ] **2.2.1** Registrazione APNs all'avvio + invio token a `/pos-devices/me/push-token`
- [ ] **2.2.2** AppDelegate `application(_:didReceiveRemoteNotification:)` → trigger one-shot sync
- [ ] **2.2.3** Entitlement: `aps-environment: production`
- [ ] **2.2.4** Background fetch fallback ogni 30 min (solo se APNs non arriva)

**File aggiunti**: `strapi/src/services/apns/index.js` (NEW). Modificati: `strapi/src/api/pos-device/{controllers/pos-device.js, routes/custom-pos-device.js, content-types/pos-device/schema.json}`, `strapi/src/services/pos-bridge/index.js`, `strapi/.env.example`, `strapi/package.json` + `package-lock.json` (`@parse/node-apn`).
**Smoke test**: APNs service caricato in isolation, fallisce graziosamente quando key path non esiste, skippa correttamente platforms non-iOS e device senza token.

---

## Fase 3 — Mobile app Android (Capacitor + Vue isolato) ✅ DONE 2026-04-27 (codice pronto, build APK richiede device + Android SDK)

**Obiettivo**: APK Android che fa lo stesso lavoro del daemon PC, con Foreground Service.

### 3.1 — Setup progetto isolato ✅

- [x] **3.1.1** Cartella `pos-rt-service/mobile/` isolata (vincolo: niente import da `vuejs/frontend/`)
- [x] **3.1.2** Vite 5 + Vue 3 + TS + Capacitor 6. `package.json`, `vite.config.ts`, `tsconfig.json`, `capacitor.config.json`, `index.html`, `.gitignore`. `npm install` OK (165 packages).
- [x] **3.1.3** Stili vendored in `src/styles/main.css` — copia minimale del design system del daemon, no import.
- [x] **3.1.4** Capacitor plugins: `@capacitor/preferences`, `@capacitor/network`, `@capacitor/app`, `@capacitor-community/sqlite`.

### 3.2 — Schermate UI ✅

- [x] **3.2.1** `views/Pair.vue` — form url+email+password+device_name+allow_insecure, save device+token cifrato in Preferences, redirect a Dashboard.
- [x] **3.2.2** `views/Dashboard.vue` — device info, status driver (printer + payment con badge online/degraded/error), audit log (ultimi 20), pulsanti start/stop polling + sync now + unpair.
- [x] **3.2.3** `views/Settings.vue` — selezione driver per RT e POS, configurazione host/port/credenziali, intervallo polling, save+reload registry.
- [x] **3.2.4** `App.vue` con bottom nav e router guard auto-redirect a /pair se non paired.

### 3.3 — Logica core (port da Node a TS portable) ✅

- [x] **3.3.1** `core/httpClient.ts` — fetch nativo, retry exp backoff, AbortController per timeout, X-Device-Token automatico.
- [x] **3.3.2** `core/scheduler.ts` — polling 10s configurabile, heartbeat 30s, `tickOnce`/`start`/`stop`/`wakeAndSyncOnce` (per silent push). Auto-avvia Foreground Service Android.
- [x] **3.3.3** `core/persistence.ts` — wrapper su `@capacitor/preferences` per device, token, apns_token, platform, drivers, poll_interval, last_cursor.
- [x] **3.3.4** `core/auditLog.ts` — append-only ring buffer (max 500 entry).
- [x] **3.3.5** `core/pairing.ts` — login JWT → register device → save token → best-effort PATCH push-token con platform.
- [x] **3.3.6** `core/jobHandlers.ts` — dispatch order.close + print.receipt → driver registry.

### 3.4 — Driver layer port (TS) ✅

- [x] **3.4.1** `drivers/types.ts` — interfacce PaymentDriver / PrinterDriver / DriverStatus / DriverError.
- [x] **3.4.2** `drivers/stubPrinter.ts` + `stubPayment.ts` — stub testabili in dev.
- [x] **3.4.3** `drivers/epsonFpmate.ts` — Epson FPMate XML/HTTP (FUNZIONA NATIVO con fetch, no plugin TCP richiesto). Mapping payment_method, parsing receiptNumber, basic auth.
- [x] **3.4.4** `drivers/genericEcr.ts` — OPI XML su TCP (richiede plugin `PosTcpSocket`).
- [x] **3.4.5** `drivers/jpos.ts` — ISO-8583 lite + encoder/decoder bitmap 64-bit (richiede plugin TCP).
- [x] **3.4.6** `drivers/customXon.ts` — Custom XON TCP (richiede plugin TCP).
- [x] **3.4.7** `drivers/escposFiscal.ts` — fallback ESC/POS-fiscal (richiede plugin TCP).
- [x] **3.4.8** `drivers/escposBt.ts` — scaffold con NOT_IMPLEMENTED, plugin BT è roadmap Fase 3.5.
- [x] **3.4.9** `drivers/registry.ts` — lazy-load + degraded-proxy fallback (stesso pattern del daemon Node).

### 3.5 — Plugin nativi Android (staging) ✅

- [x] **3.5.1** `android-plugins/PosForegroundService.kt` — Service con notifica permanente, channel Android 8+, START_STICKY.
- [x] **3.5.2** `android-plugins/PosForegroundServicePlugin.kt` — bridge Capacitor JS ↔ start/stop/getStatus.
- [x] **3.5.3** `android-plugins/PosTcpSocketPlugin.kt` — sendOnce(host,port,base64,timeout,quiet) → base64. Coroutines IO + mutex per serializzare le call.
- [x] **3.5.4** `src/plugins/foregroundService.ts` + `src/plugins/tcpSocket.ts` — wrapper JS, no-op grazioso se plugin non disponibile (build web).
- [x] **3.5.5** `android-plugins/README.md` — istruzioni complete di integrazione (cap add android, copia .kt, modifica MainActivity, patch AndroidManifest, build APK).

### 3.6 — Build verification ✅ (runtime: richiede toolchain Android)

- [x] **3.6.1** `vue-tsc --noEmit` clean (exit 0).
- [x] **3.6.2** `vite build` OK: 105 KB index principale + code-splitting per ogni driver (lazy-load via dynamic import). Bundle gzip totale ~50 KB.
- [ ] **3.6.3** `cap add android` + `cap run android` — DEFERRED: richiede Android SDK + Java + device/emulator (non disponibili in questo dev env).
- [ ] **3.6.4** APK release firmato — DEFERRED: richiede keystore + procedura di signing (utente a deploy time).

**File aggiunti**: 25 file in `pos-rt-service/mobile/` (4 config + 4 view + 6 core + 9 driver + 2 plugin JS + 3 plugin Android + README). NIENTE riuso da `vuejs/frontend/`.

---

## Fase 4 — Mobile app iOS ✅ DONE 2026-04-27 (codice + staging pronti, build IPA = utente con macOS+Xcode)

**Obiettivo**: build IPA per App Store con same feature set + APNs.

### 4.1 — APNs registration JS layer ✅

- [x] **4.1.1** Installato `@capacitor/push-notifications@^6.0.5` (compatibile con Capacitor 6) + `@capacitor/ios@^6.1.2`.
- [x] **4.1.2** `src/plugins/apnsRegistration.ts` — wrapper sopra il plugin ufficiale: `requestPermissionAndRegister()` (chiede permesso, ottiene token APNs, persiste, invia a Strapi via PATCH /pos-devices/me/push-token), `bootstrapListeners()` (idempotent, da chiamare in main.ts), `onPushReceived()` (registra handler per silent push).
- [x] **4.1.3** Token persistito in Preferences via `devicePersistence.saveApnsToken()`. Salvato cleaned (lowercase hex, 64 char) per match con backend validation.

### 4.2 — Hook silent push received ✅

- [x] **4.2.1** `main.ts` ora chiama `bootstrapListeners()` all'avvio + registra un handler `onPushReceived(data)` che chiama `wakeAndSyncOnce()` quando arriva una push con `data.jobHint` o `data.event_id` (esattamente i field che il service Strapi `apns/index.js` mette nel payload).
- [x] **4.2.2** No-op grazioso su Android/web (`isApnsCapable()` filter).
- [x] **4.2.3** Pair.vue su iOS chiede il permesso DOPO il pairing, mostra status all'utente ("Permesso accordato — wake-up in background abilitato" / "L'app userà il polling").

### 4.3 — Staging files iOS ✅

- [x] **4.3.1** `ios-staging/App.entitlements` — template con `aps-environment`. Documentazione inline su sandbox vs production endpoint, e sul match con `APNS_PRODUCTION` lato Strapi.
- [x] **4.3.2** `ios-staging/Info.plist.patch.md` — istruzioni per aggiungere:
  - `UIBackgroundModes` = `remote-notification` (silent push wake-up)
  - `NSLocalNetworkUsageDescription` (necessario iOS 14+ per LAN POS/RT)
  - `NSBonjourServices` (futuro: discovery mDNS)
  - `NSBluetoothAlwaysUsageDescription` (futuro: BT POS)
- [x] **4.3.3** `ios-staging/AppDelegate.swift.patch.md` — patch per intercettare `didReceiveRemoteNotification` e forwardare al bridge Capacitor (silent push handling background).

### 4.4 — README integrazione iOS ✅

- [x] **4.4.1** `ios-staging/README.md` — guida completa step-by-step: `cap add ios`, Xcode setup, capabilities, entitlements, plist, AppDelegate, run su device fisico, test silent push, build TestFlight, submission App Store.
- [x] **4.4.2** Documentati tutti i mismatch tipici (bundle id, APNS_PRODUCTION vs aps-environment) con istruzioni chiare di troubleshooting.
- [x] **4.4.3** Documentato esplicitamente il limite iOS: "polling sempre-on impossibile in background, APNs silent push è il meccanismo ufficiale".

### 4.5 — Build IPA + TestFlight — DEFERRED a utente

- [ ] **4.5.1** `cap add ios` su macOS → richiede Xcode + Cocoapods.
- [ ] **4.5.2** Xcode Capabilities: Push Notifications + Background Modes → "Remote notifications".
- [ ] **4.5.3** Apple Developer Program ($99/anno) per signing + TestFlight + App Store.
- [ ] **4.5.4** Test silent push end-to-end su device fisico (push NON funziona su Simulator).

### 4.6 — Build verification ✅

- [x] **4.6.1** `vue-tsc --noEmit` clean (exit 0) dopo modifiche P4.
- [x] **4.6.2** `vite build` OK: bundle 117 KB (gzip 44 KB), +12 KB rispetto a Fase 3 per push-notifications plugin. Code-splitting confermato per i driver TS.

**File aggiunti**: 4 file in `ios-staging/` (entitlements, 2 patch markdown, README), 1 file in `src/plugins/` (apnsRegistration.ts). Modificati: `main.ts`, `views/Pair.vue`, `package.json`, `package-lock.json`.

---

## Fase 5 — Distribuzione + sezione profilo Vue ✅ DONE 2026-04-27

**Obiettivo**: utente apre profilo Vue → sezione "POS / Cassa fiscale" → genera token + scarica installer/app.

### 5.1 — Backend Strapi (additivo) ✅

- [x] **5.1.1** Nuovo content-type `pos-pairing-token` (token_hash + expires_at + consumed_at + created_ip + fk_user) — solo storage, nessuna CRUD pubblica.
- [x] **5.1.2** `POST /api/pos-devices/me/pairing-token` (auth JWT) — genera token 64-hex, hash sha256 in DB, TTL 5..1440min (default 30), cleanup opportunistico dei token scaduti. Token ritornato in chiaro UNA SOLA VOLTA.
- [x] **5.1.3** `POST /api/pos-devices/register-by-token` (NO auth) — consuma token single-use, crea device, ritorna device_token. Errori: NOT_FOUND, ALREADY_EXISTS, INVALID_PAYLOAD (con dettaglio "scaduto").
- [x] **5.1.4** `GET /api/pos-devices` (auth JWT) — lista device dell'utente (esisteva già, riutilizzato).
- [x] **5.1.5** `POST /api/pos-devices/:documentId/revoke` (auth JWT) — revoca device (esisteva già).

### 5.2 — Endpoint installers ✅

- [x] **5.2.1** `GET /api/pos-devices/installers` (no-auth, pubblico) — ritorna { current_version, windows_msi_url, linux_appimage_url, macos_dmg_url, android_play_url, android_apk_url, ios_appstore_url, docs_url }. Tutti dalle env `POS_INSTALLER_*`/`POS_*_URL`/`POS_DOCS_URL`. Default: file servito da Strapi public/downloads/ se URL non valorizzato.
- [x] **5.2.2** `.env.example` esteso con sezione "NUOVE VARIABILI Fase 5" + spiegazione di ciascuna env (versione corrente, percorsi installer, URL store, URL docs).
- [x] **5.2.3** Hosting Strapi public/downloads/ — opzionale, l'admin ci copia gli installer reali quando li ha buildati.

### 5.3 — Frontend Vue (additivo) ✅

- [x] **5.3.1** Nuovo `vuejs/frontend/src/Pages/Profile/Partials/PosCassaForm.vue` — 3 sezioni: download grid (6 card: Windows MSI / macOS DMG / Linux AppImage / Android Play / iOS App Store / Android APK sideload), token generator con countdown TTL real-time + copy-to-clipboard + rigenera, device list con status dot online (last_seen<90s) + button revoca.
- [x] **5.3.2** Wire in `Pages/Profile/Show.vue` — aggiunta sidebar entry "POS / Cassa fiscale" (icon `bi-credit-card-2-front`, key `poscassa`) + render condizionale `<PosCassaForm />` nella Transition.
- [x] **5.3.3** Style scoped consistente con il design system del profilo (CSS vars --ink/--ac/--paper/--line/--dan, font Geist, radius/spacing tokens).
- [x] **5.3.4** Funzioni in `utils.js`: `generatePosPairingToken(token, ttlMinutes)`, `fetchPosDevices(token)`, `revokePosDevice(documentId, token)`, `fetchPosInstallers()`.

### 5.4 — Pos-rt-service register-by-token (Node + Mobile) ✅

- [x] **5.4.1** `pos-rt-service/src/utils/validation.js` — nuovo schema `pairByTokenSchema` (z.string regex 64-hex).
- [x] **5.4.2** `pos-rt-service/src/modules/pairing/index.js` — nuova funzione `pairByToken({strapi_url, pairing_token, device_name}, opts)`. Niente login JWT, chiama direttamente `/api/pos-devices/register-by-token`. Audit kind `device.paired_by_token`. Inferisce `platform` da os.platform().
- [x] **5.4.3** `pos-rt-service/src/api/routes/pair.js` — nuovo endpoint `POST /pair/by-token` (gated da claim-code come l'altro). Ritorna 401 se token invalido, 409 se già usato.
- [x] **5.4.4** `pos-rt-service/src/api/ui/pair.html` — UI con tab "Token (consigliato)" / "Email + password". Auto-fill di `?token=XXX` in URL. Switching dinamico fra i due flussi. Stessi stili dark del resto della UI.
- [x] **5.4.5** `pos-rt-service/mobile/src/core/pairing.ts` — nuova `pairByToken({strapiUrl, pairingToken, deviceName, allowInsecure})`. Chiama register-by-token, salva device+token in Preferences, best-effort PATCH push-token.
- [x] **5.4.6** `pos-rt-service/mobile/src/views/Pair.vue` — tabbed UI (token vs email/password), validazione 64-hex client-side, integrazione APNs come prima.

### 5.5 — Build verification ✅

- [x] **5.5.1** Daemon Node: `node --check` pulito su tutti i file modificati. **32/32 unit test verdi** (regression test ok dopo le modifiche).
- [x] **5.5.2** Mobile: `vue-tsc --noEmit` exit 0, `vite build` OK (118 KB index, gzip 45 KB; +1 KB rispetto a Fase 4 per la modalità tabbed).
- [x] **5.5.3** Frontend Vue: `npm run build` OK (Show-*.js 59 KB, +6 KB per la nuova sezione PosCassaForm).

### 5.6 — Auto-update PC (deferred, opzionale) — NON CRITICO

- [ ] **5.6.1** All'avvio, servizio chiama `GET /api/pos-devices/installers` e confronta versione corrente.
- [ ] **5.6.2** Se nuova versione → notifica dashboard locale.
- [ ] **5.6.3** Download + verifica firma + restart service (utenti reinstallano manualmente per ora).

**File aggiunti**: 5 (`pos-pairing-token` content type/controller/route/service + `PosCassaForm.vue`). Modificati: pos-device controller, custom-pos-device routes, .env.example Strapi, utils.js Vue, Show.vue, pair.js Node, pairing index Node, pair.html Node, validation Node, pairing TS mobile, Pair.vue mobile.

---

## Fase 6 — Documentazione

- [ ] **6.1** Aggiornare `docs/adr/0003-pos-rt-service.md` con:
  - Stato "implementato" anziché "proposto"
  - Aggiunte mobile (sezione nuova)
  - APNs flow
- [ ] **6.2** Nuovo `docs/adr/0004-pos-mobile-runtime.md` per scelte mobile-specifiche
- [ ] **6.3** Aggiornare `CLAUDE.md` (root) con sezione "Servizio POS/RT (locale + mobile)"
- [ ] **6.4** `pos-rt-service/docs/INSTALL.md` con istruzioni per:
  - Windows: download MSI, doppio click, incolla token
  - Android: scarica da Play Store, scansiona QR del token
  - iOS: scarica da App Store, scansiona QR del token

---

## Order of execution & checkpoint utente

Procedo lineare ma con checkpoint. Dopo Fase 0 mi fermo e ti faccio testare il restore + i fix critical. Se OK, avanti con Fase 1. Stessa cosa dopo ogni fase grossa.

**Stima effort** (giornate-uomo, ottimistico):
- Fase 0: 1 gg
- Fase 1: 4-6 gg (driver reali sono fragili, serve iterare)
- Fase 2: 2 gg (APNs setup è noioso ma diretto)
- Fase 3: 8-10 gg (Capacitor + plugin Foreground Service custom + driver port)
- Fase 4: 3-4 gg (riuso Fase 3 + tweak iOS)
- Fase 5: 3 gg (UI + endpoints + hosting)
- Fase 6: 1 gg

Totale: ~3-4 settimane di lavoro focused.

---

## Decisioni aperte che potrebbero emergere durante il lavoro

- **Hosting binari**: serve un CDN o bucket S3 per gli installer? Per ora ipotizzo Strapi static + reverse proxy nginx. Se i .msi crescono molto (firma + bundle Node) può essere meglio S3+CloudFront.
- **Code signing**: certificato EV (~€300/anno) per Windows, $99/anno per Apple. Da chiederti quando arriviamo al deploy reale.
- **Test su hardware reale**: i driver vanno testati con un terminale POS e un RT veri. Senza hardware fisico si testano solo unit + simulatore. Da pianificare.

---

## Lessons (post-task, da riempire)

> Sezione che riempio a fine task con lezioni apprese (per `lessons.md`).
