# pos-rt-service

Servizio locale (Windows / Linux / macOS) che fa da **ponte** tra Strapi CMS
e i dispositivi fisici del ristorante (stampante scontrini, Registratore
Telematico, terminale POS).

- **Architettura outbound-only**: nessuna porta aperta in entrata sul gateway
  del ristoratore. WebSocket client-initiated + HTTP polling fallback.
- **Multi-piattaforma**: runtime Node.js puro; binario singolo via `pkg`.
- **DB locale cifrato**: SQLite con secrets AES-256-GCM.
- **Audit append-only hash-chained**: corrispettivi tracciati e verificabili.
- **Idempotency end-to-end**: zero ordini duplicati.

Vedi `docs/PLAN.md` e `../docs/adr/0003-pos-rt-service.md` per il contesto completo.

## Struttura

```
src/
  main.js            # entry point
  app.js             # wire-up
  config/            # defaults + loader
  storage/           # sqlite + migrations + repositories
  services/          # httpClient, wsClient, syncService, queueManager, scheduler
  drivers/           # printer (stub), payment (stub), registry
  modules/           # pairing, print, payment
  api/               # express loopback-only + UI HTML
  utils/             # logger, crypto, errors, machine, validation, backoff
installer/
  linux/             # systemd service + install script
  macos/             # launchd plist + install script
  windows/           # PowerShell installer
tests/unit/          # test Node built-in runner
scripts/             # migrate, build
docs/                # PLAN, ADR
```

## Sviluppo

Requisiti:

- Node.js 20 LTS
- Toolchain C++ per `better-sqlite3` (solo se il prebuild non è disponibile:
  Windows build tools, Xcode CLT su macOS, `build-essential` su Linux)

```bash
cd pos-rt-service
npm install
npm run migrate            # (opzionale, viene fatto all'avvio)
npm run dev                # avvia in development con log pretty
```

Apri l'URL di pairing indicato nei log (tipicamente `http://127.0.0.1:<PORT>/ui/pair.html`).

Variabili d'ambiente utili in dev:

- `ALLOW_INSECURE=true` — consente `http://` verso Strapi (solo locale)
- `ALLOW_RE_PAIR=true` — consente ri-fare pairing sovrascrivendo il device
- `LOG_LEVEL=debug`

## Test

```bash
npm test
```

I test usano il runner built-in di Node (`node --test`) e non richiedono dipendenze esterne oltre quelle già in `package.json`.

## Build cross-platform

Il servizio si compila in un singolo binario con `@yao-pkg/pkg`:

```bash
npm run pack:linux     # → dist/linux/pos-rt-service
npm run pack:macos     # → dist/macos/pos-rt-service-{x64,arm64}
npm run pack:win       # → dist/win/pos-rt-service.exe
npm run pack:all       # tutti i target
```

## Installazione

### Windows (Administrator)

```powershell
.\installer\windows\install.ps1 -BinarySource .\dist\win\pos-rt-service.exe
```

Registra un Windows Service (`PosRtService`) come `NetworkService`. Dati in
`%ProgramData%\PosRtService`.

### Linux (root)

```bash
sudo ./installer/linux/install.sh ./dist/linux/pos-rt-service
```

Registra un servizio systemd. Dati in `/var/lib/pos-rt-service`.

### macOS (sudo)

```bash
sudo ./installer/macos/install.sh ./dist/macos/pos-rt-service
```

Installa un `launchd` daemon. Dati in `/Library/Application Support/PosRtService`.

## Pairing (prima configurazione)

1. Avvia il servizio (lo fa l'installer).
2. Apri `http://127.0.0.1:<PORT>/ui/pair.html` dal browser della stessa
   macchina (la porta è stampata nei log).
3. Inserisci l'URL Strapi, email, password del proprietario.
4. Il servizio riceve un **device_token** lungo durata, lo cifra e lo salva
   nel DB locale. Le credenziali Strapi non sono più usate.
5. Annota il **PIN locale** (mostrato una sola volta) — serve per il pannello
   di amministrazione su `http://127.0.0.1:<PORT>/ui/dashboard.html`.

Da questo momento il servizio:

- apre un WebSocket verso Strapi e ascolta eventi `job.new`
- pulla via HTTP come fallback (ogni 10-60s)
- esegue i job (stampa / pagamento) sui driver configurati
- invia `ack` a Strapi

## Mobile (roadmap)

La logica business (`modules/`) e il layer di storage (`storage/`) sono
stati scritti senza dipendenze OS-specific per facilitare il port futuro
in ambienti mobile (React Native con expo-sqlite, o web app PWA con OPFS +
WebCrypto). Gli unici pezzi platform-specific sono `utils/machine.js`
(fingerprint + appdata path) e gli `installer/`.

## Sicurezza

- Bind esclusivo su `127.0.0.1`: nessun servizio esposto sulla LAN
- Master key derivata via scrypt da salt random + machine fingerprint
- Device token cifrato AES-256-GCM a riposo
- TLS 1.2 obbligatorio verso Strapi (override solo con `ALLOW_INSECURE` in dev)
- Cert pinning opzionale via `TRUSTED_CERT_FINGERPRINTS`
- PIN locale richiesto per operazioni admin
- Rate limit 30 req/min sulle API locali

Vedi ADR-0003 per threat model completo.

## Contratto con Strapi

Endpoints richiesti lato Strapi (v1, da implementare nella prossima fase —
vedi PLAN §4 + todo.md §13):

- `POST /api/auth/local` (built-in Strapi)
- `POST /api/pos-devices/register` — ritorna `device_token`
- `POST /api/pos-devices/:id/revoke`
- `GET /api/pos-devices/me/jobs?since=&limit=`
- `POST /api/pos-devices/me/jobs/:event_id/ack`
- `POST /api/pos-devices/me/heartbeat`
- `GET /api/pos-devices/me/config`
- `WS /ws/pos` con `Authorization: Bearer <device_token>`

Il servizio è pronto: basta implementare lato Strapi i content type e gli
endpoint come da piano.

## Licenza

UNLICENSED — proprietario del progetto.
