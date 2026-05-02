# ADR-0004 — Mobile companion: real POS/RT drivers + LAN discovery

**Status:** Accepted
**Date:** 2026-05-02
**Deciders:** Filippo Manzini
**Context:** seguito di ADR-0003 (introduzione del `pos-rt-service` e companion mobile)

## Context

L'app companion mobile (`pos-rt-service/mobile/`, Capacitor + Vue 3 + TS) era operativa
con i driver `stub` di default: il flusso end-to-end con Strapi (pairing, polling
WS/HTTP, dispatch dei job `order.close` e `print.receipt`) era già funzionante,
ma **la parte di pagamento e stampa fiscale era simulata**. Per l'apertura
con il primo cliente abbiamo dovuto:

1. integrare in modo reale i due dispositivi più diffusi nel mercato italiano
   target — **cassa fiscale Ital Retail (RT)** e **POS Nexi** — mantenendo
   estendibilità per altri produttori;
2. fornire una **discovery automatica** sulla LAN locale per evitare che
   l'utente debba conoscere e digitare a mano IP e porte dei dispositivi;
3. blindare il flusso pagamento contro il **doppio addebito** dovuto a kill
   dell'app fra `payment.charge` e `ack` verso Strapi.

## Decisione

### 1. Architettura — composables Vue invece di un layer `controllers/` separato

Vue 3 con `<script setup>` è già il "controller" idiomatico: introdurre una
cartella `controllers/` avrebbe prodotto solo shim. Adottiamo `composables/`
(`useDiscovery`, `useDriverConfig`) come cinghia UI ↔ servizi.

```
mobile/src/
├── services/discovery/        # logica pure, testabile (CIDR, scan, probe)
├── composables/               # bridge UI ↔ services (idiomatico Vue 3)
├── drivers/{helpers,italretail,nexiP17}.ts
└── views/{Settings,DeviceDiscovery}.vue
```

### 2. Driver Italretail — classe wrapper su `customXon`

I modelli oggi installati sul mercato (Italstart, Nice, Big, Mech) sono
rebrand Custom: usano XON-XOFF su seriale RS-232 esposto via convertitore TCP
(porta 9100). La classe `ItalretailDriverMobile` compone internamente
`CustomXonDriverMobile` con defaults Italretail.

Modelli più recenti (XML 7.0 su HTTP/HTTPS/WebSocket) sono coperti dal
parametro `protocol: 'xml7'` riservato come hook futuro: oggi tira
`NOT_IMPLEMENTED`. L'estensione XML 7.0 non tocca `customXon.ts` — Open/Closed.

### 3. Driver Nexi P17 — Protocollo 17 / ECR17 con plugin TCP session-based

Dalla documentazione Nexi developer portal:

> Application packet: `STX(0x02) | message | ETX(0x03) | LRC`
> LRC = XOR base 0x7F con tutti i byte tra STX (escluso) e ETX (incluso)
> ACK = `0x06 0x03 0x7A`, NAK = `0x15 0x03 0x69`
> ECR è il client TCP, terminale è server. ECR avvia, terminale risponde con
> ACK immediato e poi con un secondo pacchetto (response) dopo l'inserimento PIN.
> Retry max 3 su NAK / timeout.

La primitiva esistente `tcpSocket.sendOnce` (one-shot send→read→close, con
`quietMs`) **non è adatta**: il PIN entry può durare 30+ secondi, e il
quiet-time logic chiuderebbe la connessione prima della response.

**Decisione:** nuovo plugin nativo Capacitor `PosTcpStream` con session
persistente (`open` → `send`/`recv` ripetute → `close`, mutex per-session).
Wrapper TS `tcpStream.ts` con `withSession()` (try/finally close = zero leak).
Il driver `nexiP17.ts` lo usa per implementare lo handshake completo:

```
open
send(STX|payload|ETX|LRC)
recv(1 byte) → ACK or NAK (3 retry su NAK)
recvUntil(ETX, +1 byte LRC)  # response post-PIN, timeout 120s default
unwrap → parseResponse
send(ACK)
close
```

Il **contenuto** del payload applicativo non è documentato pubblicamente
(varia per matrice campi cliente Nexi). Adottiamo un encoder pluggable
(`messageEncoder` opzione del driver) con default pipe-delimited per testing
e demo. **Sostituire** con la spec ricevuta dal merchant team prima del
go-live con il POS reale.

### 4. Idempotency persistita — pattern WAL su `@capacitor/preferences`

Senza persistenza, se l'app viene killata fra una `payment.charge` riuscita
e l'ack a Strapi:
- la cache in-memory dei driver è persa;
- al riavvio il job viene rifirato dal Strapi (cursor non avanzata fino all'ack);
- la `charge` viene rieseguita → **doppio addebito reale al cliente**.

**Soluzione:** `core/idempotency.ts` espone `persistedIdempotencyStore`
(Preferences-backed JSON map) consumato da `core/jobHandlers.ts`:

```
1. setPending(event_id, ...)  # PRIMA di toccare il POS (WAL)
2. payment.charge(...)
3. markCompleted(event_id, outcome)  # dopo successo
   markFailed(event_id, err)         # dopo failure esplicito
```

**Su retry stesso event_id:**

| stato precedente | azione |
|---|---|
| `completed` | ritorna outcome cached, NIENTE re-charge |
| `pending` | tenta `driver.inquiry?(txnRef, hint)` → se approved ritorna outcome, se not-found procede con re-charge (safe), se errore marca failed e blocca (verifica manuale) |
| `failed` | re-fire libero (un fallimento non è un addebito) |
| `null` | first-run, normale flow |

`PaymentDriver.inquiry?` è un metodo **opzionale**: nei driver senza
implementazione di Inquiry (oggi: stub, generic-ecr, jpos), un record
`pending` su retry produce `INQUIRY_UNSUPPORTED` invece di rischiare il
double-charge — l'oste verifica manualmente sullo scontrino del POS.

GC giornaliero (cutoff 24h) attivato dallo `scheduler` al boot.

### 5. LAN discovery — subnet /24 scan con concurrency 50

mDNS/Bonjour non è supportato dai POS Nexi tradizionali né dalle casse Italretail
Nice/Big → discovery via subnet scan è il **floor garantito**.

```
1. NetworkInfoPlugin.kt → CIDR via WifiManager.getDhcpInfo() (fallback NetworkInterface)
2. enumerateHosts() → 254 host /24
3. portScanner → connect-only probe (no IO!) su [80, 6000, 9000, 9100, 9101, 9999, 10001, 8080, 8443]
   → concurrency 50, timeout 300ms = ~7-10s totali
4. driverProbes → su porte aperte, send di status command innocuo + heuristic match
   → ranked candidates con confidence 0..1
5. UI: cards live (printer / payment / other) con bottoni "Imposta come <driver>"
```

**Sicurezza:** il portScanner fa SOLO TCP `connect()`, nessun byte inviato in
fase di scan. La probe attiva successiva manda **solo status command**
(innocui per RT e POS, mai print/charge). Limitato a /24 della subnet
locale, mai range esterni.

### 6. Test setup — Vitest minimal sui pure helpers

Bug di un byte sui wire protocol = silent corruption (pagamenti smarriti,
scontrini emessi senza chiusura). Test obbligatorio sui pezzi critici:

- `lrc.test.ts` (vector P17 ACK/NAK)
- `frame.test.ts` (STX/ETX wrap, ASCII-length, BE-length)
- `payTypeMap.test.ts` (preserva mapping legacy)
- `idempotency.test.ts` (set-if-absent, gc, replay)
- `networkInfo.test.ts` (CIDR enumeration)

NO Vue/Capacitor mocking, NO e2e — solo node-side pure functions.
**54 test, run in ~1.2s.**

## Conseguenze

**Positive**
- I driver `italretail` e `nexi-p17` sono pronti; quando arriva il POS Nexi
  reale dal merchant team, l'unico cambio richiesto è sostituire
  `defaultMessageEncoder` con la matrice campi specifica.
- L'idempotency persistita protegge **tutti** i driver (anche stub/generic-ecr/
  jpos) dal doppio addebito post-crash.
- Discovery LAN abilita zero-config setup per i clienti (paste IP non più necessario).
- Il plugin `PosTcpStream` sblocca anche futuri driver con risposta differita
  (Nexi JSONPOS, Ingenico Open, Worldline, ecc.) senza modifiche al daemon.

**Negative / accettate**
- L'encoder default Nexi P17 non corrisponde alla matrice campi reale: serve
  customizzazione cliente-per-cliente. Mitigazione: documentazione esplicita
  + opzione `messageEncoder` pluggabile.
- Discovery /24 può saturare router consumer entry-level con concurrency=50.
  Mitigazione: configurabile via opzione `concurrency`, default abbastanza
  conservativo per la maggior parte dei router domestici.
- Mock TCP per test/demo non sostituisce un passaggio di validazione su
  hardware reale Nexi (inclusa cattura wireshark del wire) prima del go-live.

## File chiave introdotti

- `mobile/src/drivers/helpers/{lrc,frame,payTypeMap,idempotency}.ts`
- `mobile/src/drivers/{italretail,nexiP17}.ts`
- `mobile/src/plugins/{tcpStream,networkInfo}.ts`
- `mobile/src/services/discovery/{networkInfo,portScanner,driverProbes,deviceDiscovery}.ts`
- `mobile/src/composables/{useDiscovery,useDriverConfig}.ts`
- `mobile/src/core/idempotency.ts`
- `mobile/src/views/DeviceDiscovery.vue`
- `mobile/android-plugins/{PosTcpStreamPlugin,NetworkInfoPlugin}.kt`
- `mobile/tests/fixtures/mock-{italretail,nexi-p17}-server.cjs`

## Verification

Vedi `mobile/tests/fixtures/README.md` per:
- smoke test sul mock Nexi P17 (`OP=PAY` → ACK → response → ACK)
- scenario "kill-after-charge" (idempotency end-to-end)
- istruzioni IP del laptop per uso da device fisico

54 unit test in CI (`npm test`) + smoke test integrazione manuale sul mock TCP.

Quando il POS Nexi reale è disponibile: catturare wireshark del primo handshake,
confrontare con `defaultMessageEncoder`, sostituire encoder se diverso.

## Roadmap

**v2 — non in scope di questo ADR:**
- driver Nexi SmartPOS REST API (Payment Bridge)
- Italretail XML 7.0 HTTP per modelli nuovi
- mDNS/Bonjour booster (se subnet scan non basta su reti grandi)
- BT POS Linux (`escpos-bt` resta scaffold)
- iOS native plugins (oggi build solo Android)
- persistenza driver config su Strapi (oggi resta in Preferences device-local)
