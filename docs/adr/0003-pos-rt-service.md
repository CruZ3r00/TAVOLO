# ADR-0003: Servizio locale pos-rt-service (ponte verso POS e RT fiscali)

**Stato:** proposto
**Data:** 2026-04-24
**Autore:** Software Architect
**Ambito:** monorepo `cms_restaurant` — introduzione nuovo componente `pos-rt-service/`

---

## 1. Contesto

Il CMS prevede chiusura ordine con pagamento, con strategy pattern in
`strapi/src/services/payment/` (vedi ADR-0002.7). In v1 sono implementate:

- `simulator` — funzionante, default
- `pos` — stub, lancia `NotImplementedError`
- `fiscal_register` — stub, lancia `NotImplementedError`

Per implementare realmente `pos` e `fiscal_register` servono dispositivi
fisici presenti nel ristorante (terminale POS SumUp/Nexi/Ingenico, Registratore
Telematico Epson/Custom/Olivetti). Strapi è un backend applicativo remoto: non
ha accesso diretto a quell'hardware. Serve un **servizio ponte** installato
sulla macchina del ristoratore che parli con i dispositivi per conto di Strapi.

Vincoli operativi e di deployment:

1. **Nessun port forwarding richiesto**: i ristoratori non possono/vogliono
   aprire porte in entrata sul router. L'installazione deve essere plug-and-play.
2. **Installazione semplice**: `.exe` con wizard, auto-start come Windows
   Service, configurazione tramite un flusso di pairing minimale.
3. **Isolamento**: il nuovo servizio non deve condividere codice, dipendenze o
   build con Strapi/Vue/OCR (scalabilita, autonomia di rilascio, licenze).
4. **Compliance fiscale italiana**: RT obbligatorio, audit decennale,
   tracciabilità, GDPR.
5. **Nessun data leak**: il canale Strapi ↔ servizio deve essere autenticato,
   cifrato, e il servizio non deve persistere PII cliente.

---

## 2. Decisioni

### ADR-0003.1 — Nuovo servizio autonomo

**Decisione:** introdurre un nuovo componente `pos-rt-service/` nel monorepo,
completamente isolato. Repository Node.js con propria toolchain e build
(`.exe` via `@yao-pkg/pkg` + installer NSIS).

Il servizio gira come Windows Service sulla macchina del ristoratore, parla
con i dispositivi locali (USB/LAN) ed è l'**unico** elemento del sistema che
ha accesso all'hardware fiscale.

**Alternative scartate:**

- **Integrazione diretta Strapi → device**: impossibile, Strapi non è nel
  LAN del ristoratore.
- **Tunnel reverse-SSH / ngrok**: funziona ma richiede configurazione per
  ristoratore, difficile da mantenere, single point of failure.
- **Electron app sulla macchina cliente**: troppo pesante e richiede GUI
  sempre attiva; un Windows Service è più appropriato.

### ADR-0003.2 — Architettura outbound-only (pull + WS client-initiated)

**Decisione:** il servizio **non accetta traffico in entrata da internet**.
Tutte le connessioni con Strapi sono iniziate dal servizio:

- **WebSocket client** verso `wss://<strapi>/ws/pos` per eventi real-time
  (ordine da fiscalizzare, config update). Il WS è outbound: una volta
  stabilito, Strapi invia messaggi server→client senza bisogno di porte
  inbound aperte.
- **HTTP polling** ogni 10s (60s con WS connesso) verso
  `GET /api/pos-devices/me/jobs?since=<cursor>` come fallback e catch-up.

L'unica API HTTP esposta dal servizio è bound a `127.0.0.1` per il wizard di
pairing e il pannello di diagnostica locale — **mai** accessibile da internet
o dalla LAN.

**Motivazione:** elimina la dipendenza da router config e firewall inbound;
semplifica installazione; riduce drasticamente la superficie d'attacco.

### ADR-0003.3 — Autenticazione tramite device token

**Decisione:** il servizio si appaia a Strapi tramite un flusso one-shot:

1. Admin locale apre `http://127.0.0.1:<port>/ui/pair.html`
2. Inserisce URL Strapi + credenziali utente Strapi
3. Il servizio chiama `POST /api/auth/local` → ottiene JWT utente
4. Il servizio chiama `POST /api/pos-devices/register` (JWT auth) → riceve
   `device_token` (32 byte random, stored come sha256 su Strapi)
5. Il servizio cifra e salva `device_token` in DB locale (AES-256-GCM)
6. L'endpoint `/pair` viene disabilitato

Da quel momento ogni chiamata HTTP/WS al backend è autenticata con header
`X-Device-Token: <token>`. Strapi verifica l'hash e imposta `ctx.state.device`.

Revoca: endpoint Strapi `/api/pos-devices/:id/revoke` invalida il token;
il servizio deve fare nuovo pairing.

### ADR-0003.4 — Coda locale persistente + idempotenza

**Decisione:** ogni lavoro ricevuto da Strapi (print, charge, fiscal receipt)
passa per una coda locale SQLite con `UNIQUE(event_id)`. L'idempotency key
è generata da Strapi e propagata a tutte le chiamate driver.

Stati: `pending` → `in_progress` → `done` | `failed` → (retry) → `dead_letter`.

Retry: exp backoff 30s/2m/10m/1h/6h/24h (6 tentativi), poi DLQ con alert su UI
locale. Ack verso Strapi solo dopo `done` o `dead_letter` con motivo.

**Motivazione:** garantisce zero perdita di ordini anche con Strapi/device
intermittenti. Il pattern mirror-lato-client di pattern già visti in ADR-0001
(prenotazioni) e ADR-0002 (ordini) per concorrenza server-side.

### ADR-0003.5 — Storage locale cifrato

**Decisione:** SQLite via `better-sqlite3` con WAL. Tabelle normali in chiaro;
tabella `secrets` cifrata a record con AES-256-GCM. Master key derivata via
scrypt (`N=2^17, r=8, p=1`) da:

- Salt random 32 byte (file ACL-protetto, opzionale DPAPI su Windows)
- Machine fingerprint (hostname + primary MAC + OS)

Il device token non è mai in chiaro a riposo. In caso di chiave persa:
re-pairing manuale con credenziali Strapi (lost-key recovery).

### ADR-0003.6 — Audit log append-only hash-chained

**Decisione:** tabella `audit_log` append-only con hash chain:

```
chain_hash = sha256(id || ts || kind || payload_hash || prev_hash)
```

Alterazioni storiche rilevabili via `verifyChain()` periodico.

Retention 10 anni per operazioni fiscali (corrispettivi), 12 mesi per log
tecnici. Obbligo civile (art. 2220 c.c.) e fiscale.

### ADR-0003.7 — Strategy pattern driver con registry

**Decisione:** stesso pattern di `strapi/src/services/payment/`:

- Interfaccia `PrinterDriver` e `PaymentDriver` (ognuna con `init()`,
  operazione principale, `getStatus()`, `dispose()`)
- Implementazioni: `stub` (dev/CI), `escpos` (stampante termica generica),
  `epson-fp90` (stub v1 — RT fiscale certificato post v1), `sumup` (stub v1)
- Registry `drivers/registry.js` carica il driver in base a `config.drivers.*`

v1 espone driver funzionanti per **scontrino di cortesia** ESC/POS. RT fiscale
e POS reale sono stub con interfaccia completa: implementazione reale in v2
dopo certificazione modello per modello.

### ADR-0003.8 — Modifiche a Strapi

Necessarie in parallelo, isolate in nuovo folder `strapi/src/api/pos-device/`:

1. Nuovo content type `pos-device(name, fk_user, device_token_hash,
   fingerprint, last_seen, revoked_at, version)`
2. Estensione `api::order.order` con campi `fiscal_status`
   (`not_required|pending|completed|failed`), `fiscal_receipt_id`,
   `fiscal_dispatched_at`, `fiscal_event_id`
3. Tabella tecnica `pos_jobs` per la coda server-side
4. Endpoint:
   - `POST /api/pos-devices/register` (auth JWT)
   - `POST /api/pos-devices/:id/revoke` (auth JWT)
   - `GET /api/pos-devices/me/jobs` (auth device token)
   - `POST /api/pos-devices/me/jobs/:event_id/ack` (auth device token)
   - `POST /api/pos-devices/me/heartbeat` (auth device token)
   - `GET /api/pos-devices/me/config` (auth device token)
5. `WS /ws/pos` server con auth token in upgrade
6. Modifica close order controller: se `payment_method in ('pos','fiscal_register')`
   e device attivo → asincrono via `pos_job`, altrimenti fallback strategy
   esistente (simulator / NotImplementedError)
7. Frontend `Orders.vue` gestisce stato "in attesa fiscale" con polling su
   `fiscal_status`

### ADR-0003.9 — Packaging Windows

- Binario singolo via `@yao-pkg/pkg -t node20-win-x64`
- Windows Service via `node-windows`
- Installer NSIS con wizard (install dir, account, auto-start, firewall loopback)
- Code signing Authenticode EV (obbligatorio per SmartScreen)
- Auto-update tramite endpoint Strapi `GET /api/pos-devices/latest-version`
  con verifica firma prima di sostituire il binario

---

## 3. Conseguenze

### Positive
- Installazione plug-and-play senza configurazione di rete lato ristoratore
- Zero superficie d'attacco inbound
- Isolamento di build e dipendenze, indipendenza di rilascio
- Compliance fiscale e GDPR modellate by-design
- Fallback simulator invariato per utenti senza dispositivi

### Negative
- Complessità sistemica: 4 componenti (Strapi, Vue, OCR, pos-rt-service)
- Modifiche non banali a Strapi (content type + WS server + async close)
- Costo esterno: cert Authenticode EV, DPA, eventuale certificazione RT
- Flusso chiusura ordine diventa asincrono per ristoratori con device → UX
  cambia (spinner "in attesa del registratore")

### Neutre
- Driver RT reali rimandati a v2 con certificazione modello per modello
- Auto-update richiede infrastruttura di rilascio binari (storage cloud)

---

## 4. Piano di implementazione

Dettaglio completo in `pos-rt-service/docs/PLAN.md` e `pos-rt-service/todo.md`.

Fasi principali (parallelizzabili dove indicato):

1. Bootstrap + storage + pairing (3-4g)
2. HTTP sync + WS client + queue + scheduler (7g)
3. Driver layer + moduli business (5g)
4. API locale admin + audit + packaging (5-6g)
5. Modifiche Strapi (2g, parallela alle fasi 1-2 del servizio)
6. Testing e2e + docs (4-5g)

Totale stimato: ~34 giorni-uomo + buffer + attività esterne (cert, legale).

---

## 5. Riferimenti

- `pos-rt-service/docs/PLAN.md` — piano operativo completo
- `pos-rt-service/todo.md` — checklist azionabile
- `pos-rt-service/CLAUDE.md` — vincoli di isolamento del servizio
- ADR-0002 — orders system, strategy pattern payment esistente
- `strapi/src/services/payment/index.js` — factory payment attuale (sarà
  integrata con il nuovo flusso async `pos`/`fiscal_register`)
