# Plan — Take-Away Orders Design (2026-05-06)

## Obiettivo

Progettare l'inserimento e la gestione degli ordini take-away nel gestionale senza legarli ai tavoli, riusando dove sensato la pipeline ordini esistente: routing categorie -> reparti, preparazione nei reparti, avviso sala/cassa, modifica prima dell'invio e chiusura conto.

## Checklist

- [x] Leggere `CLAUDE.md` e `lessons.md`.
- [x] Tentare il contesto via code-review graph MCP e dichiarare fallback locale se non disponibile.
- [x] Rileggere i vincoli esistenti di prenotazioni, ordini, tavoli e routing categorie.
- [x] Raccogliere decisioni prodotto/operative dall'utente prima di implementare.
- [x] Scrivere specifica tecnica/API/UI definitiva.
- [x] Verificare la specifica con l'utente.
- [x] Implementare solo dopo approvazione esplicita.

## Implementazione

- [x] Estendere `Order`/`OrderItem` flow per `service_type=takeaway` senza tavolo.
- [x] Aggiungere API autenticate e pubbliche per asporto.
- [x] Aggiungere invio ai reparti a T-15 minuti con sweep periodico/recupero.
- [x] Aggiungere email cliente per prenotazioni/asporti pubblici.
- [x] Integrare Asporto dentro `Reservations.vue` con toggle.
- [x] Evidenziare asporti nei reparti e banner in Sala per ritiro.
- [x] Aggiungere migrazione DB, SQL manuale e ADR.
- [ ] Verificare con runtime/build quando `node`/`npm` sono disponibili.

## Review

- `git diff --check` OK.
- `npm run build` non eseguibile in questo ambiente: `npm` non e' disponibile nel `PATH`.
- `node --version` non eseguibile in questo ambiente: `node` non e' disponibile nel `PATH`.
- Il grafo MCP richiesto dalle istruzioni repo non espone risorse/tool in questa sessione; fallback locale tracciato.

## Note provvisorie

- Il grafo MCP non espone strumenti/risorse in questa sessione; esplorazione fatta con fallback locale mirato.
- Gli ordini attuali sono tavolo-centrici, ma `Order.fk_table` e' tecnicamente opzionale nello schema.
- `OrderItem` salva gia categoria/portata e viene routato ai reparti tramite `category-routing`.
- La pagina `Reservations.vue` ha gia il flusso di chiusura conto usando `CheckoutModal` sugli ordini collegati.
- Take-away/asporto: richiesto anche da API pubbliche, nome+telefono obbligatori, email obbligatoria per richieste pubbliche, accettazione/rifiuto manuale, invio ai reparti 15 minuti prima o manuale anticipato, nessun tavolo/capienza, chiusura conto obbligatoria.
- La configurazione email Strapi esiste via plugin `email`/nodemailer; serve salvare email strutturata almeno su Reservation/Take-away invece che solo nelle note.
- Asporto gestionale sempre `confirmed`; asporto pubblico `pending_acceptance` con email "richiesta ricevuta"; accettazione/rifiuto devono inviare email di risposta.
- Se l'orario di ritiro e' entro 15 minuti, l'asporto confermato va inviato ai reparti comunque, anche come recupero dopo downtime/server riavviato.


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
# Plan - Landing Animations And Plans Detail (2026-05-09)

## Obiettivo

Allineare le animazioni della landing tra build modern e legacy: la sezione funzionalita deve usare lo stesso schema pinned con card che salgono dal basso e si sovrappongono; le card dei piani devono avere contenuti piu dettagliati e una comparsa desktop su cilindro invisibile, con fallback mobile/legacy a stack sovrapposto leggibile.

## Checklist

- [x] Leggere `CLAUDE.md`, `vuejs/frontend/CLAUDE.md` e `lessons.md`.
- [x] Tentare il contesto via code-review graph MCP e dichiarare fallback locale se non disponibile.
- [x] Mappare `Landing.vue`, `LandingFeatureFlipDeck.vue` e fallback legacy.
- [x] Sostituire il flip della seconda sezione con stack pinned a card sovrapposte.
- [x] Espandere contenuti piano Essenziale/Professionale con differenze operative.
- [x] Aggiungere animazione piani desktop large con Three.js e fallback mobile/legacy a stack.
- [x] Rendere opachi gli sfondi delle card sovrapposte per evitare testo illeggibile sul legacy.
- [x] Verificare build/diff e documentare risultati.

## Review

- Code-review graph MCP tentato, ma `get_minimal_context` e' andato in timeout dopo 120s; fallback locale usato.
- `npm install` eseguito in `vuejs/frontend` per ripristinare `three` mancante in `node_modules`; `package-lock.json` non risulta modificato.
- `npm run build:modern` OK.
- `npm run build:legacy` OK.
- Playwright Chromium installato e usato su `http://127.0.0.1:5174/landing`: screenshot desktop/mobile, nessun errore console/page, card feature/piani opache e senza overflow, canvas Three.js non blank su desktop; mobile piani in stack e canvas piani nascosto come previsto.
- Dev server Vite lasciato attivo su `http://127.0.0.1:5174/`.


# Plan — Modulo Bar e Gestione Magazzino Avanzata (2026-05-13)

## Obiettivo

Aggiungere due moduli al gestionale:
1. **Gestione Bar** (tutti i piani): nuova tab "Bevande" nel MenuSetter; pagina inventario turno bar con conteggio unita bottiglie consumate; modale "Carico fatto" (sostituisce "Chiudi turno") con stampa locale opzionale.
2. **Gestione Magazzino avanzata** (solo Owner, solo piano `pro`): nuovo content type `Ingredient` + relazione `ElementIngredient`; scarico automatico al `served`; alert predittivi e per soglia con workflow "ordinato → ricevuto" + tracking spese.

Il modulo Bar è funzionalmente indipendente sul piano starter, ma sul piano pro le bevande con "gestione avanzata" attingono dal magazzino tramite ricetta. Le quantita di un turno bar vengono **scaricate dal magazzino al click "Carico fatto"** (consolidamento atomico — il frigo bar resta concetto operativo, niente entity dedicata).

Refactor incluso: `Element.ingredients` (JSON di stringhe) → relazione `ElementIngredient`, mantenendo identica la public API menu e l'OCR.

## Decisioni di prodotto consolidate (riepilogo)

- **Bevande unitarie** (bottiglie/lattine intere): contate 1:1 al `served`. Auto-Ingredient implicito su pro (1 Ingredient con `unit=pz`, `qty_per_serving=1`).
- **Bevande "gestione avanzata"** (calici/cocktail/drink miscelati): flag esplicito `is_beverage_advanced` sull'Element, editor a 2 campi per ingrediente (capacita unita + uso porzione). Conteggio unita = `ceil(somma uso turno / capacita unita)`.
- **Turno bar**: 1 turno aperto/owner. "Carico fatto" mostra solo unita bottiglie usate, non revenue. Modale full-screen non-dismissibile (escape solo via "Annulla" o "Carico fatto"); il click "Carico fatto" chiude e apre subito il nuovo turno.
- **Stampa locale**: `window.print()` + browser default printer (opzione C). Niente WebUSB.
- **Profili**:
  - Owner: tutto.
  - Gestione: tab Bevande nel MenuSetter; pagine bar inventory; **non** gestione magazzino.
  - Staff bar (pro): pagina inventario bar.
  - Staff cucina (starter): vede inventario bar al posto di "kitchen-inventory".
  - Staff cucina (pro): solo il suo board cucina.
- **Magazzino avanzato**: visibile solo a Owner su pro. Su starter: tab "Magazzino" presente nel MenuSetter ma intera scheda **offuscata** con upgrade CTA (no enable parziale).
- **OrderItem free-form**: mantenuti. Al `served` di un item free-form si applica regex sul nome estraendo Ingredient dell'owner (`name_normalized` match) → scarico magazzino best-effort. Non-match → niente scarico, item solo a revenue.
- **OrderItem snapshot** (`name`/`price`/`category`): mantenuti per fiscale. `fk_element` diventa la reference autoritativa per ricetta/ingredienti, ma `OrderItem.name/price/category` resta snapshot freeze.
- **Element soft-archive**: nuovo campo `is_archived` (bool). Element archiviato non appare nel public menu ne nella gestione menu, ma resta in DB per FK integrity (OrderArchive).
- **Ordini cliente voided**: nuovi campi `voided`/`voided_reason`/`voided_at` su `OrderItem`. Voided → InventoryMovement compensativo di `kind=waste reason=order_voided`. Conteggio "errori di ordine" aggregato su `RestaurantDailyStat` (no dashboard dedicata, solo dati pronti per statistiche future).
- **Alert dispensa**: predittivo e per soglia, entrambi attivi, aggregati per tipo. Header bar visibile su ogni pagina solo per owner. Polling 30s + email (nodemailer esistente, fail-soft).
- **Cron alert**: ogni 4h, scan ingredienti owner pro, dedup 24h o livello peggiorato.
- **i18n**: italiano hardcoded (rework futuro). **No telemetria** richiesta.

## Architettura — modello dati

### Modifiche a entity esistenti

- `Element`:
  - `is_beverage` boolean default false (visibile come toggle nella modifica)
  - `is_beverage_advanced` boolean default false (toggle solo dalla scheda Bevande, abilita editor ricetta)
  - `is_archived` boolean default false (soft delete; nascondi da public menu + gestionale, mantieni FK)
  - **rimosso** dopo verifica: `ingredients` JSON (vedi FASE 4)
- `User`:
  - **rimosso** dopo verifica: `unavailable_ingredients` JSON (migrato a `Ingredient.is_unavailable`)
- `OrderItem`:
  - `voided` boolean default false
  - `voided_reason` text maxLength 500
  - `voided_at` datetime
  - `fk_element` resta `manyToOne opt` (consente free-form); semantica: opt → free-form; valorizzato → da menu
  - `name`/`price`/`category` **restano** come snapshot
- `RestaurantDailyStat`:
  - `voided_count` integer default 0
  - `voided_revenue_lost` decimal default 0

### Nuovi content type Strapi

- `bar-shift` (collectionType, draftAndPublish off): `opened_at`, `closed_at`, `opened_by` (rel user), `closed_by` (rel user), `fk_user` (rel user owner), `status` enum [open|closed] default open, `note` text, `snapshot` json.
- `ingredient` (collectionType, draftAndPublish off): `name` (req), `name_normalized` (req), `unit` enum [g|kg|ml|l|pz|mazzo], `unit_size` decimal (capacita confezione, ml per liquidi), `stock_qty` decimal default 0, `low_stock_threshold` decimal (opt, override manuale), `reorder_lead_days` decimal default 3, `is_unavailable` boolean default false (toggle starter), `is_active` boolean default true, `supplier_name`, `supplier_email`, `notes` text, `allergens` json, `fk_user` (rel user owner). Unique `(fk_user, name_normalized)`.
- `element-ingredient` (collectionType, draftAndPublish off): `fk_element` (rel manyToOne element), `fk_ingredient` (rel manyToOne ingredient), `qty_per_serving` decimal default 0 min 0, `unit_override` enum.
- `inventory-movement` (collectionType, draftAndPublish off, append-only): `fk_ingredient`, `fk_user`, `kind` enum [initial|restock|consumption|waste|adjustment] (req), `qty_delta` decimal (req), `qty_after` decimal (req), `cost` decimal (opt, valorizzato su `restock`), `fk_order` (opt rel), `fk_order_item` (opt rel), `fk_restock_order` (opt rel, valorizzato su `restock`), `reason` string (opt; per waste: `expired|broken|order_voided|other`), `note` text, `created_at` datetime (req, indicizzato).
- `restock-order` (collectionType, draftAndPublish off): `fk_user`, `fk_ingredient`, `ordered_at`, `received_at` (null finche non arrivato), `expected_qty` decimal, `received_qty` decimal (opt; valorizzato al receive), `cost` decimal (opt), `cancelled_at` (opt), `note` text, `status` enum [ordered|received|cancelled] default ordered.
- `inventory-alert` (collectionType, draftAndPublish off): `fk_user`, `alert_type` enum [predictive|threshold] (req), `ingredients_payload` json (lista `[{fk_ingredient, predicted_depletion_at, stock_qty}]`), `level` enum [info|warning|critical], `sent_email` boolean, `sent_inapp` boolean, `acknowledged_at` datetime, `acknowledged_by` (rel user), `dismissed_by_restock` boolean default false, `created_at` datetime.

### Indici / vincoli

- `bar_shifts`: unique partial `(fk_user) where status='open'`; index `(fk_user, closed_at desc)`.
- `ingredients`: unique `(fk_user, name_normalized)`; index `(fk_user, is_active)`.
- `element_ingredients`: index `(fk_element)`, `(fk_ingredient)`.
- `inventory_movements`: index `(fk_ingredient, created_at desc)`, `(fk_user, kind, created_at desc)`.
- `restock_orders`: index `(fk_user, status)`, `(fk_ingredient, ordered_at desc)`.
- `inventory_alerts`: index `(fk_user, acknowledged_at)`, `(fk_user, created_at desc)`.

## Architettura — API

### Bar shifts (auth)

- `GET    /api/bar-shifts/current` → `{ data: shift|null }`
- `GET    /api/bar-shifts/current/report` → vedi formato sotto (409 BAR_SHIFT_NOT_OPEN se nessun open)
- `POST   /api/bar-shifts/open` `{ note? }` → 201 (409 BAR_SHIFT_ALREADY_OPEN)
- `POST   /api/bar-shifts/:id/close` `{ note? }` → idempotente, 200 con snapshot
- `POST   /api/bar-shifts/carico-fatto` `{ note? }` → atomic: close current + open new (1 round-trip)
- `GET    /api/bar-shifts/history?from&to&page&pageSize`
- `GET    /api/bar-shifts/:id/report`

Report format (sia `current/report` sia `snapshot`):
```json
{
  "data": {
    "shift_id": 42,
    "opened_at": "...", "closed_at": "...|null",
    "duration_seconds": 7320,
    "units": [
      { "element_documentId": "...", "name": "Acqua 0.5L", "category": "Bevande", "is_beverage_advanced": false,
        "served_count": 12, "units_consumed": 12 },
      { "ingredient_id": 17, "name": "Gin Tanqueray (bottiglia 750ml)", "category": "Bar",
        "ml_consumed_in_shift": 200, "units_consumed": 1 }
    ],
    "freeform": [
      { "name": "Spritz speciale", "served_count": 2, "matched_ingredients": [{"ingredient_id":33,"name":"Aperol","ml_estimated":100,"units":1}] }
    ]
  }
}
```

Logica `units_consumed`:
- Per bevanda unitaria (`is_beverage_advanced=false`): `units_consumed = served_count` (ogni `served` = 1 bottiglia/lattina/bottiglietta).
- Per bevanda advanced (`is_beverage_advanced=true`): aggrega per Ingredient sommando `ElementIngredient.qty_per_serving × served_count`; `units_consumed = ceil(sum_qty / ingredient.unit_size)`.
- Per item free-form (no `fk_element`): regex match su `OrderItem.name` cerca `Ingredient.name_normalized` dell'owner; ogni match contribuisce con `qty_per_serving` stimata (default = 1 unita se Ingredient unit='pz', altrimenti 0 = "non quantificato, solo riferito").

### Ingredients (auth, dual-mode)

Su piano starter, `/api/ingredients` mantiene la firma legacy ma legge dalle nuove tabelle:
- `GET    /api/ingredients` → `[{ id, name, allergens, count_in_dishes, dishes[], unavailable }]` (compat shape attuale)
- `PUT    /api/ingredients/toggle` `{ ingredient_id|name, unavailable }` (accetta entrambe le forme per retrocompat) → aggiorna `Ingredient.is_unavailable`.

Su piano pro (rotte gating-aware, owner-only):
- `GET    /api/ingredients/advanced` → lista completa con stock_qty, threshold, predicted_depletion_at, lead_days
- `POST   /api/ingredients` `{ name, unit, unit_size?, allergens?, supplier_*?, low_stock_threshold?, reorder_lead_days? }`
- `PATCH  /api/ingredients/:id`
- `DELETE /api/ingredients/:id` (soft: setta `is_active=false`; preserva FK)
- `POST   /api/ingredients/:id/restock` `{ qty, cost?, note? }` → InventoryMovement + opzionalmente collega a RestockOrder pending
- `POST   /api/ingredients/:id/waste` `{ qty, reason, note? }` → InventoryMovement waste (NON impatta media uso/piatto)
- `POST   /api/ingredients/:id/confirm-depleted` `{ residual_qty? }` → conferma "terminato" o aggiorna stock + ricalcola media uso/piatto

### Restock orders (auth, pro, owner)

- `POST   /api/restock-orders` `{ items: [{ fk_ingredient, expected_qty, cost? }], note? }`
- `GET    /api/restock-orders?status&from&to` 
- `POST   /api/restock-orders/:id/receive` `{ received_qty, cost?, note? }` → setta `received_at`, calcola lead_time effettivo, ricalcola `Ingredient.reorder_lead_days` (media mobile esponenziale α=0.3), crea InventoryMovement kind=restock, dismissa alert ingrediente.
- `POST   /api/restock-orders/:id/cancel`

### Inventory alerts (auth, pro, owner)

- `GET    /api/inventory/alerts?status=unread|all` → top N alert non acknowledged
- `POST   /api/inventory/alerts/:id/acknowledge`
- (dismissione automatica via restock-orders/:id/receive)

### Element ricetta (auth, pro, owner)

Esposto via il controller esistente di Element:
- `GET    /api/elements/:id/recipe` → `{ ingredients: [{ fk_ingredient, name, qty_per_serving, unit }] }`
- `PUT    /api/elements/:id/recipe` `{ ingredients: [...] }` → replace transactional

## Architettura — service layer

### `services/bar-shift.js`
- `ensureOpenShift(strapi, ownerId)` → throws BAR_SHIFT_NOT_OPEN se nessun open
- `openShift(strapi, ownerId, openedById, note)` → tx + FOR UPDATE su unique partial index
- `buildReport(strapi, shift)` → aggrega OrderItem `served`/`picked_up` nel periodo, applica logica unitaria/advanced/free-form
- `caricoFatto(strapi, shift)` → tx: scarica magazzino (chiama `inventory.commitBarShift`), chiude shift con snapshot, apre nuovo shift

### `services/inventory.js`
- `applyOnServe(strapi, orderItem, trx)` — chiamato dentro la tx di `PATCH order-item/:id/status` quando `served`. Logica:
  - Se `orderItem.fk_element` valorizzato: itera ElementIngredient → InventoryMovement consumption + decrementa stock
  - Se `fk_element` null (free-form): regex match Ingredient → idem
  - Se Element ha `is_beverage_advanced=true`: **NON scarica** in questa funzione (verra scaricato a "carico fatto"). Item gia conteggiato dal turno.
- `applyOnVoid(strapi, orderItem, trx)` — quando item voided: compensativo waste con `reason=order_voided`
- `commitBarShift(strapi, shiftReport, trx)` — al carico fatto: per ogni unita_consumata della sezione `units`, decrementa Ingredient.stock_qty e crea InventoryMovement consumption
- `parseFreeformIngredients(strapi, ownerId, freeformName)` — regex su Ingredient.name_normalized dell'owner; ritorna `[{ingredient_id, estimated_qty}]`
- `recalcUsageAverages(strapi, ingredientId, residualHint?)` — al confirm-depleted: ricalcola `qty_per_serving` delle ElementIngredient di quell'ingrediente usando formula auto-tuning (vedi sotto)

Formula auto-tuning `recalcUsageAverages`:
```
Sia I = ingredient, E_i = piatti che usano I (via ElementIngredient).
n_i = numero di porzioni servite di E_i dall'ultimo restock di I.
qty_actual = stock_at_last_restock + restocks_since - residual_now (o 0 se confirm_depleted senza residuo)
qty_old_total = somma su i di (n_i * qty_per_serving_i_old)
factor = qty_actual / max(qty_old_total, epsilon)
Per ogni piatto E_i con n_i > 0:
   qty_per_serving_i_new = qty_per_serving_i_old * factor
Persistito come InventoryMovement kind=adjustment + update ElementIngredient.qty_per_serving.
Cap di sicurezza: factor clamped a [0.5, 2.0] per evitare oscillazioni.
```

### `services/inventory-alerts.js`
- `runAlertScan(strapi)` — chiamato dal cron 4h. Per ogni owner pro attivo:
  - Per ogni Ingredient: calcola `consumption_rate` (EMA α=0.3 ultimi 14g), `days_to_depletion`, controlla soglia predittiva e quantitativa
  - Raggruppa per tipo (`predictive` vs `threshold`)
  - Genera al massimo 2 alert/owner/scan (1 per tipo), aggregando piu ingredienti
  - Dedup: se ultimo alert dello stesso tipo entro 24h e livello NON peggiorato → skip
  - Invio email (template HTML) + insert in DB
- `dismissForRestock(strapi, ingredientId)` — chiamato da receive restock; setta `dismissed_by_restock=true` su tutti gli alert non-acknowledged contenenti quell'ingrediente; se vuoti, marca acknowledged.

Bootstrap cron in `src/index.js` `register()`/`bootstrap()`: `setInterval(runAlertScan, 4*60*60*1000)` + fail-soft try/catch + skippa se SMTP non configurato.

## Architettura — Frontend

### Tab MenuSetter aggiornate

`Pages/MenuSetter.vue`:
- **Piatti** (esistente, invariato salvo accenni alla ricetta sul pro vedi sotto)
- **Bevande** (nuovo, tutti i piani): `<BeverageList/>` filtrata `is_beverage=true` + bottoni "Nuova bevanda" + toggle "gestione avanzata" inline per bevanda (pro). Modal "Editor ricetta bevanda" mostra 2 campi per ingrediente (capacita + uso porzione).
- **Magazzino** (nuovo, solo Owner):
  - Pro: pagina completa `<PantryView/>` con KPI, lista ingredienti, modali Restock/Waste/Confirm-depleted, editor ricette dei piatti, storico movimenti.
  - Starter: intera scheda **offuscata** (overlay con upgrade CTA). Lo `IngredientsManager` legacy resta accessibile via tab vecchio "Ingredienti" (ma rinominato in stile per coerenza, vedi sotto).
- **Ingredienti** (rinominato "Lista ingredienti" su starter, nascosto su pro a favore di "Magazzino"): fallback semplice — toggle disponibile/terminato (`Ingredient.is_unavailable`). Visibile a Owner+Gestione.

### Nuove pagine

- `Pages/BarManagement.vue` mounted su 2 route condizionate:
  - `/bar/management` — `staffRoles: [OWNER, GESTIONE, BAR]` (su pro)
  - `/kitchen/bar-management` — `staffRoles: [OWNER, GESTIONE, CUCINA]` (solo per starter; il middleware backend rifiuta CUCINA su pro)
- `<CaricoFattoModal/>` componente full-screen non-dismissible. Solo bottoni "Annulla" e "Carico fatto". Mostra solo unita bottiglie (no revenue). Pulsante "Stampa" usa `window.print()` con CSS print stylesheet dedicato `<style media="print">`.
- `<AlertHeaderBar/>` (solo Owner, in `AppLayout.vue` top): polling 30s `GET /api/inventory/alerts?status=unread`; banner full-width quando ci sono alert critici.

### Compat legacy

- Componenti `.vue` nuovi: niente `<i .../>`/`<span .../>` self-closing su HTML5; usare TeleportCompat; v-model senza arg per Vue 2.7.
- `__MODERN__` flag per tree-shaking eventuali animazioni della pagina Magazzino.

## Strategia di migrazione produzione

### FASE A — Additive (zero downtime, totalmente safe)
1. Deploy migrazione DB `006_inventory_schema.js` (CREATE TABLE IF NOT EXISTS per `ingredients`, `element_ingredients`, `inventory_movements`, `restock_orders`, `inventory_alerts`, `bar_shifts`). 
2. Deploy migrazione `007_elements_flags.js` (ADD COLUMN se non esiste: `is_beverage`, `is_beverage_advanced`, `is_archived` su elements; `voided`, `voided_reason`, `voided_at` su order_items; `voided_count`, `voided_revenue_lost` su restaurant_daily_stats).

### FASE B — Backfill idempotente
3. Script `database/migrations/008_ingredients_backfill.js` (idempotente, fail-soft). Per ogni owner:
   - Per ogni Element: per ogni stringa in `ingredients` JSON, find-or-create `Ingredient(fk_user=owner, name_normalized=norm(s), name=trim(s), unit='pz', stock_qty=0, is_active=true)`. Crea `ElementIngredient(fk_element=el, fk_ingredient=ing, qty_per_serving=0)`.
   - Per ogni Element con `category` classificata BAR da regex `category-routing.classifyCategory`: set `is_beverage=true` (auto-detection iniziale). NON setta `is_beverage_advanced`.
   - Per ogni stringa in `User.unavailable_ingredients`: trova Ingredient corrispondente per quell'owner e setta `is_unavailable=true`.

### FASE C — Controllers patch (release contestuale al backfill)
4. Modifica `GET /api/menus/public/:userDocumentId` → legge ElementIngredient JOIN Ingredient.name e ricompone array di stringhe; **stesso JSON output** della versione attuale.
5. Modifica OCR controller `POST /api/menus/import/bulk` → riceve array di stringhe come ora, persiste come ElementIngredient (find-or-create Ingredient nominali). Niente piu scrittura su `elements.ingredients` JSON.
6. Modifica `GET /api/ingredients` legacy → legge da Ingredient table aggregando con count_in_dishes via ElementIngredient. Stesso shape di risposta.
7. Modifica `PUT /api/ingredients/toggle` → ora aggiorna `Ingredient.is_unavailable` invece di `User.unavailable_ingredients` JSON. Cascading availability degli Element resta uguale (recalcolata server-side).
8. Modifica `addOrderItem` → quando `fk_element` valorizzato non snapshotta piu `ingredients`. Per free-form: stesso comportamento (no snapshot).

### FASE D — Cleanup (settimane dopo verifica)
9. Solo dopo che zero codice legge `elements.ingredients` JSON e `up_users.unavailable_ingredients`:
   - Migrazione `009_drop_legacy_ingredients_json.js`: DROP COLUMN `elements.ingredients`, DROP COLUMN `up_users.unavailable_ingredients`.

### Rollback
- FASE A-B: niente da rollbackare (additive).
- FASE C: rollback dei controller files; il DB resta intatto. Frontend continua a leggere il JSON dalle Element row che non hanno mai smesso di averlo (perche additive).
- FASE D: irreversibile, da fare solo con backup recente verificato.

## Checklist implementativa (ordine consigliato di sviluppo)

### Setup
- [ ] Creare branch `feature/bar-and-pantry` da `master` (o `security-hardening` se non ancora mergiato).
- [ ] Verificare presenza variabili env SMTP_USER/SMTP_PASS in `.env` dev per testare alert email.

### FASE 0 — Schema + Migrazioni additive (COMPLETATA 2026-05-13)
- [x] Aggiornare `src/api/element/content-types/element/schema.json` con `is_beverage`, `is_beverage_advanced`, `is_archived`, `fk_element_ingredients` (oneToMany).
- [x] Aggiornare `src/api/order-item/content-types/order-item/schema.json` con `voided`, `voided_reason`, `voided_at`.
- [x] Aggiornare `src/api/restaurant-daily-stat/.../schema.json` con `voided_count`, `voided_revenue_lost`.
- [x] Creare schema Strapi nuovi content type (schema.json + routes vuote + controller/service `createCoreController/Service`):
  - [x] `api::ingredient.ingredient` (sostituisce controller-only attuale, aggiunge content type vero)
  - [x] `api::element-ingredient.element-ingredient` (relazione ricetta strutturata)
  - [x] `api::inventory-movement.inventory-movement` (audit append-only)
  - [x] `api::restock-order.restock-order` (ciclo ordinato → ricevuto)
  - [x] `api::inventory-alert.inventory-alert` (alert raggruppato predittivo/threshold)
  - [x] `api::bar-shift.bar-shift` (turno bar con snapshot report)
- [x] Scrivere `database/migrations/202605130001_bar_inventory_indexes.js` (idempotente; solo indici di lettura non auto-generati da Strapi). Unicita `(fk_user, name_normalized)` su ingredients e "1 shift open / owner" su bar_shifts: enforced via service layer FOR UPDATE + retry (FASE 1/3).
- [x] Verifica `npm run build`: OK in 66s, admin panel compilato, schema validati internamente, relazioni inter-modulo coerenti. **DB Supabase di produzione NON toccato** (build admin non applica migrazioni).

### FASE 1 — Modulo Bar (backend) (COMPLETATA 2026-05-13)
- [x] Aggiungere `served_at` (datetime opt) a OrderItem schema. Popolato in:
  - `order.controller#updateItemStatus` quando `nextStatus === 'served'`
  - `order.controller#pickupTakeaway` (pickupTime condiviso per tutti gli item del takeaway)
- [x] Implementare `src/services/bar-shift/index.js`:
  - `findOpenShift(strapi, ownerId)`
  - `openShift(strapi, ownerId, openedById, note)` con `SELECT FOR UPDATE` + `withRetry` (db-lock.js)
  - `closeShift(strapi, ownerId, shiftIdOrDocId, closedById, note)` idempotente (chiudere uno gia chiuso ritorna lo snapshot)
  - `caricoFatto(strapi, ownerId, actorId, note)` atomic close-current + open-new; placeholder per inventory.commitBarShift (FASE 4)
  - `buildReport(strapi, ownerId, shift)`: aggrega OrderItem `served` (dine-in via `served_at`) + Order takeaway `picked_up` (via `picked_up_at`) nel periodo `[opened_at, closed_at|now)`; per Element `is_beverage=true` calcola `units_consumed` (= served_count quando `is_beverage_advanced=false`; `null` placeholder quando advanced — completato in FASE 4); free-form con category classificata BAR in sezione separata.
  - `listHistory(strapi, ownerId, {from,to,page,pageSize})` paginated
  - `getById(strapi, ownerId, shiftIdOrDocId)`
- [x] Implementare `src/api/bar-shift/controllers/bar-shift.js` con 8 handler (current, currentReport, openShift, closeShift, caricoFatto, getHistory, findOne, getReport) + `sendError(strapi, ctx, err)`.
- [x] Aggiungere `src/api/bar-shift/routes/custom-bar-shift.js` con tutti gli endpoints. Il file `routes/bar-shift.js` lascia `routes: []` (no auto-routes).
- [x] Aggiornare `src/middlewares/subscription-gate.js`:
  - Nuovo `BAR_SHIFT_PATH_PATTERNS` + helper `isBarShiftPath(path)`
  - Firma `isStaffApiAllowed(role, method, path, ownerPlan)` (nuovo 4° arg)
  - Gating: BAR → OK (esiste solo su pro), CUCINA → OK solo se `ownerPlan === 'starter'`, altri staff → 403
- [x] Verifica `npm run build`: OK 80s. Validazione sintattica JS+JSON di tutti i file modificati: PASS.

**FASE 4 (dipendenze segnalate)**:
- Hook `inventory.commitBarShift(strapi, report, trx)` dentro `caricoFatto` per scaricare le quantita dal magazzino centrale al "carico fatto".
- Calcolo `units_consumed` per Element `is_beverage_advanced=true` via ElementIngredient + Ingredient.unit_size.
- `parseFreeformIngredients` per matchare free-form name su Ingredient.name_normalized dell'owner.

### FASE 2 — Modulo Bar (frontend) (COMPLETATA 2026-05-13)
- [x] Nuovo `vuejs/frontend/src/lib/api/bar-shift.js`: `fetchBarShiftCurrent`, `fetchBarShiftCurrentReport`, `openBarShift`, `closeBarShift`, `caricoFatto`, `fetchBarShiftHistory`, `fetchBarShiftById`, `fetchBarShiftReport`, `barShiftErrorMessage`. Re-export da `utils.js`.
- [x] Estendere `Pages/MenuSetter.vue` con 4 tabs: "Piatti" / "Bevande" (tutti i piani) / "Ingredienti" / "Magazzino" (solo Owner, su starter intera scheda offuscata con upgrade CTA → `/renew-sub`; su pro placeholder "Pro: in arrivo" che FASE 4 completera').
- [x] Nuovo `Components/BeverageList.vue`: lista filtrata `is_beverage=true`, toggle inline `is_beverage_advanced` (pro), CTA "Sposta nei piatti" (unflag), modale placeholder editor ricetta avanzata, empty state, search.
- [x] Estendere `MenuAdder.vue` con prop `mode: 'dish' | 'beverage'`: titolo dinamico, default `category='Bevande'`, set `is_beverage=true` al submit in modalita beverage.
- [x] BeverageAdvancedEditor: placeholder modal integrato in BeverageList (full editor con ingredienti + qty_per_serving sara' in FASE 4).
- [x] Nuovo `Pages/BarManagement.vue`: header KPI (unita / vendite / incasso / voci), tabella per Element bar, sezione free-form separata, polling 20s visibility-aware, storico paginato con modale dettaglio, CTA "Carico fatto", stato vuoto + "Apri turno bar".
- [x] Nuovo `Components/CaricoFattoModal.vue` full-screen non-dismissible (uscite solo via "Annulla" o "Carico fatto"). Mostra solo unita bottiglie (nessun revenue). Sezione `<style>` non-scoped con `@media print` per `body > *` visibility hack + `body .cf-overlay` cf-print-area: window.print() apre il dialog browser con la stampante salvata di default OS.
- [x] Route `/bar-management` con `meta.staffRoles: [OWNER, GESTIONE, BAR, CUCINA]` (gating piano lato server). NB: scelta una sola route invece di `/bar/management` + `/kitchen/bar-management` per semplicita.
- [x] `staffAccess.canSeeNavItem`: helper `canSeeBarManagement(user)` plan-aware: BAR sempre, CUCINA solo se `subscription_plan === 'starter'`, owner+gestione sempre.
- [x] `AppSidebar.vue` + `MobileBottomNav.vue`: aggiunto nav item `bar-management` (icona `bi-cup-hot`/`bi-cup-hot-fill`), label "Gestione bar" per owner, "Inventario bar"/"Inventario" per staff. `activeKey` riconosce path `/bar-management` con priorita su `/bar`.
- [x] Verifica build: `npm run build:modern` OK 10s, `npm run build:legacy` OK 62s. CSS `@media print` correttamente emesso in entrambi i bundle (`BarManagement-*.css`). Nuovi chunk: BarManagement modern 20kB / legacy 21kB.

**FASE 4 (dipendenze segnalate)**:
- BeverageAdvancedEditor completo (editor 2 campi per ingrediente: capacita unita + uso porzione).
- Tab "Magazzino" pro: PantryView + RestockModal + WasteModal + RecipeEditor.
- Editor ricetta dentro `MenuAdder` solo pro (qty_per_serving per ingrediente).

### FASE 3 — Refactor Element.ingredients → ElementIngredient (COMPLETATA 2026-05-13)
- [x] Creare `src/services/ingredients/index.js`: `norm`, `trim`, `findOrCreateIngredient(ownerId, rawName)` con retry su race, `syncElementRecipe(ownerId, elementId, names[])` (replace atomic delete+create), `listElementIngredientNames(elId)` con fallback JSON, `batchListElementIngredientNames(elIds)`, `listOwnerIngredientsAggregate(ownerId)` (shape legacy IngredientsManager), `setIngredientUnavailable(ownerId, name, bool)` con cascading availability degli Element (relazione + fallback JSON).
- [x] Patch `src/api/element/controllers/element.js`:
  - `buildElementData` ora accetta anche `is_beverage`, `is_beverage_advanced`, `is_archived`
  - `serializeElement` esporta i nuovi flag
  - `create` e `update` chiamano `ingredientsService.syncElementRecipe` dopo il document write (fail-soft, dual-write con JSON legacy)
  - `remove` ora fa **soft delete** (set `is_archived=true, available=false`) come da N-2 per preservare FK integrity con OrderItem.fk_element
- [x] Patch `src/api/menu/controllers/menu.js`:
  - `serializeElement(el, recipeMap)` usa la mappa batch ElementIngredient → Ingredient.name; fallback JSON
  - `serializeMenu(menu, recipeMap)` filtra `is_archived=true` dagli elementi visibili
  - `list` (`GET /api/menus`) usa `batchListElementIngredientNames` per la mappa ricette
  - `publicMenu` (`GET /api/menus/public/:userDocumentId`) idem + filtra `is_archived` dal public menu
  - `bulkImport` (OCR `POST /api/menus/import/bulk`) chiama `syncElementRecipe` dopo ogni element create (fail-soft, dual-write)
- [x] Patch `src/api/ingredient/controllers/ingredient.js`:
  - `list` → `ingredientsService.listOwnerIngredientsAggregate(ownerId)` (shape legacy mantenuta)
  - `toggle` → `ingredientsService.setIngredientUnavailable(ownerId, name, bool)`; accetta sia legacy `{ingredient, unavailable}` sia `{ingredient_id, available}` per compat
  - Risolve owner via `resolveStaffContext` per supportare gestione+staff
- [x] Migration `database/migrations/202605130002_ingredients_backfill.js`:
  - Per ogni Element del owner: parse JSON, find-or-create Ingredient via (owner_id, name_normalized), crea ElementIngredient(qty=0) con check idempotente sui link tables
  - Per ogni `User.unavailable_ingredients`: setta `Ingredient.is_unavailable=true` sui match per nome dell'owner
  - Idempotente (gira N volte = stesso risultato), fail-soft (errori sul singolo Element loggati e continua), no-op se le tabelle non esistono ancora
  - Usa knex raw + tabelle Strapi v5 `*_lnk` per portabilita cross-dialect (PG/MySQL/SQLite)
- [x] Decisione: OrderItem snapshot `name`/`price`/`category` MANTENUTI per fiscale (vedi N-2). Quindi nessun cambio a `addOrderItem`.
- [x] Frontend MenuAdder/MenuList invariati: continuano a inviare/ricevere `ingredients: [string]` come prima. Editor strutturato qty_per_serving sara' in FASE 4 dietro tab Magazzino (solo Owner+Pro).
- [x] Verifica `npm run build` Strapi: OK 80s. Schema validati internamente, relazioni `Element ↔ ElementIngredient ↔ Ingredient` coerenti.

**Strategia di rollback safe**:
- Codice nuovo legge da ElementIngredient ma cade sul JSON legacy se non popolato (durante migrazione, prima del backfill).
- I controller continuano a scrivere il JSON legacy in dual-write per consentire rollback senza data loss.
- La migration backfill non tocca i dati legacy (no destructive operations). Cleanup del JSON solo in FASE successiva (post-verifica prod) — vedi `todo.md` ROLLOUT.

### FASE 4 — Modulo Magazzino avanzato (backend + frontend) (COMPLETATA 2026-05-13)

**Backend services**:
- [x] `src/services/inventory/index.js`: `applyOnServe` (scarico al served via ElementIngredient, no-op per is_beverage_advanced), `applyOnVoid` (compensativo waste reason=order_voided), `commitBarShift` (scarico bevande al carico fatto: unitarie via auto-Ingredient + advanced via ElementIngredient × served_count), `parseFreeformIngredients` (regex su Ingredient.name_normalized), `applyRestock`/`applyWaste`/`appendMovement` (append-only audit + stock clamp >=0), `recalcUsageAverages` (auto-tuning EMA con factor clamp [0.5, 2.0]).
- [x] `src/services/inventory-alerts/index.js`: `runAlertScan` (cron entry point con loop per owner), `runOwnerScan` (computa forecast EMA α=0.3 + threshold custom + level info/warning/critical), `maybeCreateAlert` (dedup 24h, skip se level non peggiorato), `dismissForRestock` (pulisce ingredient dai payload alert; ack se vuoti), `sendAlertEmail` (template HTML via nodemailer, fail-soft no-op senza SMTP).

**Backend controllers/routes**:
- [x] `api/ingredient/controllers/ingredient.js` esteso con endpoint pro: `listAdvanced`, `createAdvanced`, `updateAdvanced`, `removeAdvanced` (soft via is_active=false), `restock`, `waste`, `confirmDepleted`, `listMovements`.
- [x] `api/restock-order/controllers/restock-order.js`: `create` (batch items), `list` (paginato + filter), `findOne`, `receive` (movement + recalc lead time EMA + dismissForRestock), `cancel` (idempotente).
- [x] `api/inventory-alert/controllers/inventory-alert.js`: `list` (con unread_count meta), `acknowledge` (idempotente).
- [x] Routes corrispondenti con tutti gli endpoint.

**Backend hooks**:
- [x] `applyOnServe` chiamato in `order.controller#updateItemStatus` quando nextStatus=='served' (fail-soft, NON blocca FSM).
- [x] `applyOnServe` chiamato anche per ogni item appena passato a served in `pickupTakeaway`.
- [x] `commitBarShift` chiamato dentro `bar-shift.service#caricoFatto` (fail-soft).
- Nota: hook `applyOnVoid` predisposto nel service ma endpoint `PATCH /void` ancora da implementare in FASE 5.

**Backend gating & cron**:
- [x] `subscription-gate.js`: nuovo `PANTRY_PRO_PATH_PATTERNS` + helper `isPantryProPath(method, path)`. Tutte le rotte pro/advanced (`/ingredients/advanced`, `/ingredients/:id/restock|waste|confirm-depleted|movements`, POST/PATCH/DELETE `/ingredients`, `/restock-orders/*`, `/inventory/alerts/*`, `/elements/:id/recipe`) → solo `role==='owner'` AND `ownerPlan==='pro'`.
- [x] `src/index.js` bootstrap: `startInventoryAlertsScan(strapi)` con `setInterval` cadenzata da `INVENTORY_ALERTS_INTERVAL_MS` (default 4h). Primo run differito di 2min. Fail-soft try/catch su error. Feature flag `INVENTORY_ALERTS_ENABLED=false` per disabilitare.
- [x] Endpoint dedicato in element controller: `GET /api/elements/:documentId/recipe` + `PUT /api/elements/:documentId/recipe` per editor strutturato (qty_per_serving).
- [x] Service `ingredientsService.setStructuredRecipe(ownerId, elementId, recipe[])` + `listElementRecipe(elementId)`.

**Frontend**:
- [x] `src/lib/api/inventory.js` con tutti gli helper (advanced + restock-orders + alerts + element recipe) + `inventoryErrorMessage`. Esposti da `utils.js`.
- [x] `Components/PantryView.vue`: KPI (totali, critici, in allerta, prossimo esaurimento), tabella ingredienti con stock/soglia/predizione/stato, sezione alert attivi inline, sezione ordini rifornimento pending, modali Create/Edit, integrazione con RestockModal/WasteModal/IngredientDepletionModal.
- [x] `Components/RestockModal.vue` (carico: qty + cost + nota + preview nuovo stock).
- [x] `Components/WasteModal.vue` (scarto: qty + reason `expired|broken|order_voided|other` + nota, NON impatta media uso).
- [x] `Components/IngredientDepletionModal.vue` (conferma "Terminato" vs "Quantita residua" → backend auto-tuning con feedback factor mostrato).
- [x] `Components/BeverageAdvancedEditor.vue` (sostituisce placeholder FASE 2): editor con 4 campi per riga (Nome ingrediente + autocomplete da advanced list + Unita + Capacita unita + Uso per porzione). Spec Negroni come tooltip esempio.
- [x] `Components/AlertHeaderBar.vue` (banner header `AppLayout`, solo OWNER pro, polling 30s visibility-aware, espandibile, link a `/menu-handler?tab=pantry`, ack inline).
- [x] `Layouts/AppLayout.vue`: integrato `<AlertHeaderBar />` sopra lo `<slot/>` principale.
- [x] `Pages/MenuSetter.vue`: tab "Magazzino" ora monta `<PantryView/>` se `isOwner && isPro`, altrimenti UpgradePrompt embedded. Deep-link via `?tab=pantry` supportato in mount + watch route.
- [x] `Components/BeverageList.vue`: il toggle `is_beverage_advanced=true` apre `BeverageAdvancedEditor` (pro) o modale upsell con link `/renew-sub` (starter).

**Verifica build**:
- [x] `npm run build` Strapi: OK 62s.
- [x] `npm run build:modern` Vite: OK 11s. PantryView chunk separato (`PantryView-*.js`).
- [x] `npm run build:legacy` Vite: OK 65s. Vue 2.7 compat preservata (niente self-closing su HTML5 elements, niente v-model con arg, TeleportCompat ovunque).
- [x] DB Supabase produzione **NON toccato**.

**FASE 5 dipendenza già predisposta**: il service `inventory.applyOnVoid` è pronto; manca solo l'endpoint `PATCH /api/orders/:id/items/:itemId/void` (FASE 5).

### FASE 5 — Voided OrderItem  ✅
- [x] Endpoint `PATCH /api/orders/:documentId/items/:itemDocumentId/void` `{ reason, lock_version? }` (cameriere+):
  - `strapi/src/api/order/controllers/order.js` → `voidItem` handler.
  - `strapi/src/api/order/routes/custom-order.js` → route PATCH `/orders/:documentId/items/:itemDocumentId/void`.
  - Marca `voided=true`, `voided_reason`, `voided_at`; ricalcola `total_amount` (computeTotal esclude voided); rispetta optimistic locking; rigetta double-void con `ITEM_NOT_EDITABLE`.
  - Hook `inventoryService.applyOnVoid` solo se `item.status === 'served'`, fail-soft (non blocca).
- [x] `RestaurantDailyStat` aggiornato:
  - `strapi/src/services/stats.js` → `bumpVoided({ userId, dateKey, count, revenueLost })`. Upsert idempotente (crea row se assente).
  - Incrementato dentro `voidItem` (fail-soft).
  - `updateElementStats` e `archiveClosedOrder` ora saltano items con `voided=true` (no double-count alla chiusura).
  - `items_count` in finalizer/controller esclude voided.
  - `OrderArchive.items_json` conserva voided con flag + reason per audit.
- [x] Frontend:
  - `vuejs/frontend/src/lib/api/orders.js` → `voidOrderItem(...)`.
  - `vuejs/frontend/src/utils.js` → re-export.
  - `vuejs/frontend/src/components/VoidItemModal.vue` (nuovo) → modale conferma con textarea reason obbligatoria (min 2, max 500), warning specifico se item gia `served`.
  - `vuejs/frontend/src/components/OrderItemRow.vue` → bottone "Annulla" (status != taken, ordine attivo, can-void prop); badge "Annullato" + strikethrough; reason visibile inline.
  - `vuejs/frontend/src/components/OrderDetailModal.vue` → wire-up `handleOpenVoid`/`handleVoidConfirm`/`handleVoidCancel`, stato `voidModalShow`/`voidTargetItem`/`voidSubmitting`, gestione STALE_ORDER, optimistic update.
- [x] Build verification: Strapi build 50s OK; Vue modern 10.8s OK; Vue legacy 1m4s OK. DB Supabase non toccato.

### FASE 6 — Test + Verifica
### FASE 6 — Test + Verifica ✅ (pure-unit; smoke E2E rimandato a deploy staging)
- [x] Test backend unitari per `services/inventory.js`:
  - `tests/inventory.test.js` — `appendMovement` (clamp >= 0, delta positivo, troncamento reason/note);
    `parseFreeformIngredients` (regex match, filtro owner, is_active, case-insensitive);
    `computeUsageFactor` (replica clamp [0.5, 2.0] di `recalcUsageAverages`).
- [x] Test backend `services/stats.js`:
  - `tests/stats.test.js` — `bumpVoided` create row, somma su existing, no-op su zero/missing args, defensive coerce.
- [x] Test `computeTotal` con voided:
  - aggiunto in `tests/utils.test.js` — esclude voided dal subtotal, total=0 se tutti voided.
- [x] Build verifica:
  - Strapi `npm run build`: OK 50s. Vue modern: OK 10.8s. Vue legacy: OK 1m4s.
- [x] `npm test` Strapi: 36/36 pass.
- [ ] Smoke E2E Playwright (bar/free-form/gating): rimandato alla checklist staging in `docs/deploy-bar-pantry.md §4`.
- [ ] Verifica visual legacy (Chromium 37 emulato): da fare manualmente post-deploy.

### FASE 7 — Deploy + Cleanup ✅ (deliverable pronti)
- [x] Migrazione knex `202605140001_void_and_stats_columns.js`:
  - Aggiunge colonne mancanti in prod (Supabase) — idempotente.
  - Copre: `order_items.voided/voided_reason/voided_at/served_at` + `restaurant_daily_stats.voided_count/voided_revenue_lost` + indice `idx_order_items_voided`.
- [x] Documento `docs/deploy-bar-pantry.md`:
  - Riepilogo migrazioni in ordine cronologico.
  - Verifica pre-deploy.
  - Step staging (backend + frontend + backfill).
  - Smoke checklist staging (8 scenari).
  - Step produzione + verifica SQL post-deploy.
  - Metriche monitor + query log.
  - Step cleanup JSON legacy.
  - Rollback procedure (codice + DB + tracker).
- [x] Migrazione 009 (drop JSON legacy) preparata come `.disabled`:
  - `strapi/database/migrations/202605300001_drop_legacy_element_json.js.disabled`.
  - Guardia doppia: extension `.disabled` (knex non la carica) + env flag `ENABLE_LEGACY_JSON_DROP=true`.
  - Sanity check pre-drop (`element_ingredients` non vuoto).
  - Workflow di attivazione documentato in `deploy-bar-pantry.md §7`.
- [ ] **AZIONI MANUALI (l'utente le esegue al deploy)**:
  - [ ] Snapshot Supabase prima del deploy.
  - [ ] Deploy migrations + code in staging → smoke checklist.
  - [ ] Deploy in produzione + monitor.
  - [ ] Dopo 1-2 settimane senza regressioni: attivare migrazione 009.

## Note tecniche di sicurezza

- **Authorization**: tutte le rotte filtrano per `fk_user = effective_user_id`. `subscription-gate.js` blocca a livello middleware.
- **Concorrenza**: BarShift open usa unique partial index + FOR UPDATE; transazioni di `applyOnServe`/`commitBarShift` riusano `db-lock.js` retry pattern.
- **Idempotenza**: `bar-shifts/:id/close` ritorna lo stesso snapshot se gia chiuso; `restock-orders/:id/receive` rifiuta double-receive; `inventory-movements` sono append-only.
- **Audit**: ogni decremento/incremento crea InventoryMovement con `qty_after` snapshot. Storico ricostruibile.
- **Fail-soft**: cron alert non blocca operazioni; SMTP failure logged ma non rilancia. Regex free-form best-effort: se nessun match, item passa senza scarico.
- **Rate limit**: `bar-shifts/open` e `bar-shifts/carico-fatto` limitati a 30/ora/owner (anti-doping); `restock-orders` 200/giorno/owner.
- **Validazione**: `qty_per_serving` >= 0, `stock_qty` >= 0 (no negativi), `qty_delta` non zero, `cost` >= 0, `note` <= 1000.

## Review (da compilare dopo l'implementazione)

- [ ] Diff vs main del modulo Bar isolato (verificare nessuna regressione su modulo Orders).
- [ ] Diff vs main del refactor JSON→relation (verificare public menu API byte-identical su sample requests).
- [ ] Diff vs main del modulo Magazzino isolato.
- [ ] Lighthouse / accessibility audit su nuove pagine.
- [ ] Verifica gating in produzione con utenti reali starter+pro.
- [ ] Aggiornare `lessons.md` con eventuali pattern emersi.
- [ ] Aggiornare `docs/adr/` con nuovo ADR `0006-bar-and-pantry.md` riassumente le decisioni chiave.
- [ ] Aggiornare `CLAUDE.md` root e file CLAUDE.md modulo con info su nuovi content type/route.

---

# FASE 8 — Riassetto UX Bar/Magazzino (post-feedback utente)

## Contesto
Dopo l'integrazione iniziale del modulo Bar/Magazzino sono emersi gap:
1. Owner pro non accede alla tab Magazzino (manca `subscription_plan` nel payload utente staff + localStorage stale).
2. Manca un toggle per spostare un piatto esistente nella tab Bevande (e viceversa).
3. La voce "Gestione bar / Inventario bar" in sidebar/bottomnav e' duplicata per owner/gestione: deve restare solo per staff bar/cucina come "Carico bar".
4. La tab "Ingredienti" su pro va sostituita dalla tab "Magazzino"; su starter resta "Ingredienti" aggiornata al nuovo modello dati + banner upgrade non invasivo.
5. Tutto il codice diventato inutile va rimosso (no dead code).

## Matrice di accesso finale
| Profilo | Sidebar/bottomnav | `/menu-handler` tab | `/bar-management` |
|---|---|---|---|
| Owner starter | (no Carico bar) | Piatti, Bevande, Ingredienti | NO |
| Owner pro | (no Carico bar) | Piatti, Bevande, Magazzino | NO |
| Gestione starter | (no Carico bar) | Piatti, Bevande, Ingredienti | NO |
| Gestione pro | (no Carico bar) | Piatti, Bevande, Magazzino | NO |
| Staff bar (pro) | "Carico bar" | nessun accesso | SI |
| Staff cucina (starter) | "Carico bar" | nessun accesso | SI |
| Staff cucina (pro) | nessuna voce bar | nessun accesso | NO |

## FASE 8.A — Fix accesso Pro (backend + store)
- [x] `strapi/src/utils/staff-access.js` — `staffUserPayload` include `subscription_plan` (+ `subscription_status`) cosi' lo staff eredita il piano dell'owner sul client.
- [x] `vuejs/frontend/src/store.js` — nuova action `refreshUser({ commit, state })` che chiama `/api/users/me` (Bearer + cookie credentials), committa `setUser` con il payload aggiornato, fail-soft.
- [x] `vuejs/frontend/src/Layouts/AppLayout.vue` — `checkLog` sostituito da dispatch `refreshUser()` su mount con propagazione ai display fields.
- [x] `vuejs/frontend/src/Pages/RenewSub.vue` — dopo `syncBillingCheckout` aggiunto `dispatch('refreshUser')` per riallinearsi a `/users/me`. (`ChoosePlan` redirige a `/renew-sub` post-Stripe, quindi il sync e' centralizzato.)

## FASE 8.B — Riorganizzazione tab `MenuSetter.vue`
- [x] Tab visibili in funzione di `isPro`/`isOwner`:
  - starter (owner+gestione): `Piatti | Bevande | Ingredienti`
  - pro owner: `Piatti | Bevande | Magazzino`
  - pro gestione: `Piatti | Bevande` (Magazzino owner-only per design)
- [x] Rimosso blocco placeholder pantry e lock-icon span: non servono piu'.
- [x] Aggiunto `isValidTab(tab)` + `resolveTabFromQuery(tab)`. Deep-link `?tab=` skippa valori non validi per piano/ruolo.
- [x] Cleanup CSS scoped: rimosse classi `.pantry-placeholder*` e `.pf-tab-lock`.

## FASE 8.C — Turno bar dentro tab Bevande (owner/gestione)
- [x] Estratto body in `components/BarShiftPanel.vue` (props `mode: 'page'|'modal'`, emit `close`). Riusa `CaricoFattoModal`.
- [x] `Pages/BarManagement.vue` ridotto a wrapper: `<AppLayout page-title="Carico bar"><BarShiftPanel mode="page"/></AppLayout>`.
- [x] In `MenuSetter.vue` tab Bevande: bottone "Turno bar" nel toolbar header (visibile solo quando `activeTab === 'beverages'`) che apre modal full-screen Teleport con `<BarShiftPanel mode="modal" @close>`.

## FASE 8.D — Sidebar / Bottomnav: "Carico bar" solo per staff bar/cucina
- [x] `AppSidebar.vue` — rimossa voce `bar-management` dalla lista owner. Label staff "Inventario bar" → "Carico bar".
- [x] `MobileBottomNav.vue` — rimossa voce dalla lista owner. Label staff "Inventario" → "Carico bar".
- [x] `staffAccess.js` — `canSeeBarManagement`: owner+gestione false, BAR true, CUCINA true solo su starter. Aggiornato `canSeeNavItem` di conseguenza.
- [x] `router/index.js` — route `/bar-management`: `staffRoles: [BAR, CUCINA]`. Nome route "Carico bar".

## FASE 8.E — Toggle "Questa e' una bevanda" nel form di modifica
- [x] `MenuList.vue` (host del modal di modifica): aggiunto toggle switch "Questa e' una bevanda" nel form edit, vincolato a `toModify.is_beverage`. Payload PUT include `is_beverage`.
- [x] `MenuList.vue` emette `element-updated` dopo save; `MenuSetter.vue` ascolta e refresha `beverageListRef`.
  - Nota: l'edit modale vive in MenuList, non in MenuAdder (che e' solo creation-only).

## FASE 8.F — `IngredientsManager` allineato al nuovo modello dati
- [x] `IngredientsManager.vue` resta compatibile: il backend `/api/ingredients` (legacy shape) legge gia' dalle nuove entita `Ingredient` (controller con `is_unavailable`).
- [x] Aggiunto upsell banner non invasivo (card cliccabile, una riga + CTA Magazzino) linkato a `/renew-sub`.
- [x] CSS scoped coerente con design system (color-mix sui colori primary, fallback variabili dual).

## FASE 8.G — Cleanup (no dead code)
- [x] Rimosso import `API_BASE` orfano in `AppLayout.vue`.
- [x] Nessun residuo "Inventario bar" / "Gestione bar" / "kitchen-inventory" / `.pantry-placeholder` (grep all confermano).
- [x] `staffAccess.js`: JSDoc di `canSeeBarManagement` aggiornata.

## FASE 8.H — Test manuali (da eseguire utente)
- [ ] Logout/login owner pro → vede `Piatti | Bevande | Magazzino`, Magazzino apre PantryView. Nessuna voce "Carico bar" in sidebar.
- [ ] Logout/login owner starter → vede `Piatti | Bevande | Ingredienti`. Ingredienti mostra banner Pro. Nessuna voce "Carico bar".
- [ ] Tab Bevande (owner qualsiasi piano): CTA "Turno bar" apre modal con `BarShiftPanel`, "Carico fatto" funziona.
- [ ] Staff bar pro login → vede "Carico bar" in sidebar/bottomnav. `/bar-management` apre la pagina (solo turno bar, niente CRUD bevande). Nessun accesso a `/menu-handler`.
- [ ] Staff cucina starter login → vede "Carico bar" come sopra. Stesso comportamento.
- [ ] Staff cucina pro login → nessuna voce "Carico bar".
- [ ] Edit piatto esistente in `MenuAdder` → toggle "Questa e' una bevanda" → save → l'elemento si sposta in tab Bevande, refresh OK.
- [ ] Cambio piano starter → pro via Stripe portal → ritorno su frontend, `refreshUser` propaga `subscription_plan='pro'`, Magazzino tab compare senza logout.

---

# FASE 9 — Fix UX post-test utente

## Contesto
Test utente (pro) sulle FASI 7-8 ha rilevato i seguenti bug e gap funzionali:
1. MenuAdder (creation): manca toggle "Questa e' una bevanda".
2. Gestione avanzata bevande gated a Pro (deve essere disponibile a tutti i piani).
3. Modale ricetta avanzata appare solo all'attivazione del flag e si perde dopo;
   per riaprirlo bisogna disattivare/riattivare e si perdono i dosaggi.
4. Nuovi piatti con categoria "Bevande" non vengono auto-classificati `is_beverage=true`.
5. Owner pro vede ancora il banner upsell Pro in tab Ingredienti perche' isPro
   parte false (localStorage stale prima del refreshUser).
6. Pannello Magazzino vuoto: i piatti esistenti con ingredienti JSON legacy non
   sono stati migrati a `Ingredient` + `ElementIngredient`.

## FASE 9.A — Auto-flag is_beverage + toggle MenuAdder
- [x] `strapi/src/api/element/controllers/element.js` — in `buildElementData`,
  se il client non forza `is_beverage`, applica `classifyCategory(category) === BAR`
  come auto-default. Stessa logica per create e update.
- [x] `vuejs/frontend/src/components/MenuAdder.vue` — nuovo ref `isBeverage`
  precompilato in base al `mode`, toggle inline nel form, payload include
  sempre `is_beverage` esplicito. Reset coerente.

## FASE 9.B — Gestione avanzata bevande disponibile su tutti i piani
- [x] `strapi/src/middlewares/subscription-gate.js` — rimosso `/api/elements/:id/recipe`
  da `isPantryProPath`. La ricetta avanzata e' un modulo bar, non dispensa.
- [x] `vuejs/frontend/src/components/BeverageList.vue` — rimosso ogni check `isPro`,
  toggle Avanzata trasformato in `<button>`:
  - off → on: setta flag e apre editor
  - on (gia attivo): apre editor in modifica (NON disattiva)
  Disattivazione solo via pulsante dedicato dentro l'editor.
- [x] `vuejs/frontend/src/components/BeverageAdvancedEditor.vue` — aggiunto
  pulsante "Disattiva avanzata" nel footer + emit `deactivated`. La disattivazione
  preserva le ElementIngredient (riattivare non perde i dosaggi).
- [x] Rimosso modal upsell Pro e import inutilizzati (Modal) da BeverageList.

## FASE 9.C — Backfill legacy JSON ingredients
- [x] `strapi/src/services/ingredients/index.js` — nuova
  `backfillLegacyJsonIngredients(strapi, ownerId)`: per ogni Element dell'owner
  con `ingredients` JSON non vuoto e zero `ElementIngredient`, chiama
  `syncElementRecipe`. Idempotente.
- [x] Chiamata lazy da `listOwnerIngredientsAggregate` e da `listAdvanced`,
  cosi' Magazzino e Ingredienti popolano automaticamente la dispensa con i
  piatti gia in menu (anche senza dosaggi/stock impostati).

## FASE 9.D — Robustezza isPro post-refreshUser
- [x] `vuejs/frontend/src/Pages/MenuSetter.vue` — `onMounted` ora await
  `store.dispatch('refreshUser')` PRIMA di scegliere la tab attiva, cosi'
  l'owner pro non parte mai sulla tab Ingredienti per stale localStorage.
- [x] Watch su `isPro`: se la tab corrente diventa non piu' valida (es. dopo
  upgrade Stripe), fallback automatico a `list`.

## FASE 9.E — Test manuali (utente)
- [ ] Aggiungere nuovo piatto (mode=dish), spuntare "Questa e' una bevanda",
  salvare → l'elemento compare in tab Bevande dopo refresh.
- [ ] Creare elemento con categoria "Vini" → automaticamente in Bevande.
- [ ] Su starter: attivare "Avanzata" su una bevanda → modale appare,
  inserire dosaggi → salvare → riaprendo dal toggle, modale carica i dosaggi.
- [ ] Bottone "Disattiva avanzata" toglie il flag ma conserva i dosaggi
  (riattivando li ritrovo).
- [ ] Owner pro apre /menu-handler → tab Magazzino visibile (nessun banner Pro).
- [ ] Magazzino mostra tutti gli ingredienti gia esistenti dai piatti del menu,
  anche con stock=0 e qty_per_serving=0.


