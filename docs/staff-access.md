# Accessi staff

La gestione staff completa puo arrivare in una schermata dedicata. Intanto il
backend crea automaticamente gli account operativi alla registrazione del
ristorante.

## Ruoli

- `owner`: account ristorante esistente, accesso completo.
- `gestione`: cassa/gestione, accesso a dashboard, sala, cucina, menu,
  prenotazioni e profilo.
- `cameriere`: solo sala.
- `cucina`: solo cucina.

## Creazione automatica

Alla registrazione di un nuovo ristorante, se `REGISTER_AUTO_STAFF_ACCOUNTS`
non e' `false`, vengono creati:

- `<NomeRistorante>.cameriere`
- `<NomeRistorante>.cucina`

La password iniziale e' la stessa scelta dal titolare in registrazione.
Esempio per `Trattoria al grande`:

- `TrattoriaAlGrande.cameriere`
- `TrattoriaAlGrande.cucina`

## Creazione manuale

1. Crea un utente con ruolo users-permissions `Authenticated`.
2. Imposta `staff_role` a `cameriere`, `cucina` o `gestione`.
3. Collega `fk_owner` all'utente ristorante titolare.
4. Mantieni gli account staff con email uniche. Lo username puo seguire questo
   formato:
   - `TrattoriaAlGrande.cameriere`
   - `TrattoriaAlGrande.cucina`

Gli ordini e i tavoli restano collegati al titolare: gli account staff usano
automaticamente l'owner come ristorante effettivo.
