# Mock TCP servers per i driver POS/RT

Server Node minimi (zero dipendenze, solo std lib) che simulano i protocolli
wire dei dispositivi reali. Servono per:

1. Smoke test del plugin nativo `PosTcpSocket` / `PosTcpStream` su device fisico
   (avvii il mock sul tuo laptop, lo punti dall'app via Wi-Fi).
2. Test di idempotency end-to-end (vedi scenario "kill-after-charge" in
   `docs/adr/0004-mobile-discovery-and-real-drivers.md`).
3. Demo cliente quando il device fisico (POS Nexi reale) non è disponibile.

## Esecuzione

```bash
# Mock cassa Italretail (XON over TCP).
node tests/fixtures/mock-italretail-server.cjs 9100

# Mock POS Nexi (Protocollo 17 / ECR17).
node tests/fixtures/mock-nexi-p17-server.cjs 9999

# Mock Nexi che declina il 50% delle transazioni:
node tests/fixtures/mock-nexi-p17-server.cjs 9999 --decline-rate=0.5

# Mock Nexi con simulazione PIN entry più lenta (5s):
node tests/fixtures/mock-nexi-p17-server.cjs 9999 --pin-delay=5000
```

## IP del laptop

Sul telefono, in Settings → Driver → Host inserisci l'IP LAN del laptop dove
giri il mock (es. `192.168.1.50`). Verifica:

```bash
# Linux/macOS
ip -4 addr show | grep inet | grep -v 127.
# oppure
ifconfig | grep "inet " | grep -v 127.
```

Il telefono e il laptop devono essere sulla stessa Wi-Fi.

## Test idempotency P17 ("kill-after-charge")

1. Avvia il mock con `--pin-delay=8000`.
2. Sul telefono, apri un ordine, premi "Chiudi" (parte un job `order.close`).
3. Mentre il mock è in attesa di rispondere (8s), **forza-chiudi l'app dal task switcher**.
4. Riapri l'app: il job viene rifirato dal Strapi. Il driver Nexi P17 vede il
   record `pending` in `paymentPending` e fa una **Inquiry**. Il mock risponde
   `RC=00 TXN=TXxxxx`. Il job marca completed senza riaddebbitare.
5. Conferma sul mock: il counter `txnCounter` è incrementato di **1**, non di 2.

Se il counter è 2 → c'è un bug nella catena idempotency (jobHandlers / persistedIdempotencyStore / nexiP17.inquiry).
