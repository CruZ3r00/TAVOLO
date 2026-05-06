# ADR-0004: Sistema Asporto

**Stato:** accettato
**Data:** 2026-05-06

## Decisione

Gli ordini asporto riusano `Order` e `OrderItem` con `service_type = takeaway`.
Non sono collegati a tavoli, non occupano capienza e restano legati ai dati
cliente (`customer_name`, `customer_phone`, `customer_email`) e all'orario di
ritiro (`pickup_at`).

## Stato

FSM asporto:

`pending_acceptance -> confirmed -> sent_to_departments -> ready -> picked_up -> closed`

- `pending_acceptance`: solo richieste pubbliche.
- `confirmed`: asporto accettato ma non ancora visibile ai reparti.
- `sent_to_departments`: item visibili ai reparti in base al routing categoria.
- `ready`: tutti gli item sono `ready`.
- `picked_up`: cameriere/owner ha ritirato l'ordine dalla cucina; si puo chiudere il conto.
- `closed`: pagamento completato.

## Invio Ai Reparti

Un asporto confermato viene inviato ai reparti 15 minuti prima di `pickup_at`.
Se viene creato o accettato entro 15 minuti dal ritiro, viene inviato subito.
Un job in bootstrap controlla ogni minuto e recupera anche ordini scaduti/non
inviati dopo downtime.

## Email Pubbliche

Le richieste pubbliche di prenotazione e asporto richiedono email cliente.
Il sistema invia email di richiesta ricevuta, conferma e rifiuto. La conferma
o il rifiuto non vengono finalizzati se l'email al cliente fallisce.
