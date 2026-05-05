# Accessi staff

La gestione staff nasce dal database: la registrazione e gli aggiornamenti
dell'abbonamento owner richiamano `public.sync_owner_staff_accounts(owner_id)`,
mentre i trigger SQL mantengono utenti staff, link `fk_owner` e righe
`public.restaurant_staff` idempotenti.

## Ruoli

- `owner`: account ristorante pagante, accesso completo e rinnovo Stripe.
- `gestione`: cassa/gestione, accesso operativo completo ma non checkout.
- `cameriere`: sala e prenotazioni.
- `cucina`: board cucina.
- `bar`: board bar, solo piano Professionale.
- `pizzeria`: board pizzeria, solo piano Professionale.
- `cucina_sg`: board senza glutine, solo piano Professionale.

## Piani

- Essenziale (`starter`) attivo: owner, cameriere e cucina.
- Professionale (`pro`) attivo: owner, cameriere, cucina, bar, pizzeria e
  cucina sg.
- Abbonamento non attivo: solo owner puo accedere al rinnovo; gli staff usano
  sempre l'abbonamento dell'owner e non hanno dati Stripe propri.

## Creazione automatica

Il database crea o aggiorna gli account staff con la stessa password hash
dell'owner:

- `<NomeRistorante>.cameriere`
- `<NomeRistorante>.cucina`
- `<NomeRistorante>.bar`
- `<NomeRistorante>.pizzeria`
- `<NomeRistorante>.cucinasg`

Gli account sono `confirmed = true`. Il campo `blocked` e la riga
`restaurant_staff.active` seguono il piano dell'owner.

## Smistamento categorie

`public.restaurant_category_routing` salva la prima classificazione di ogni
categoria per owner:

- categorie bevande/bar -> `bar`
- categorie senza glutine -> `cucina_sg`
- categorie pizze/pizzeria -> `pizzeria`
- tutto il resto -> `cucina`

La classificazione automatica avviene solo al primo inserimento della categoria;
le righe possono essere rese gestibili dal profilo owner in una schermata
successiva.
