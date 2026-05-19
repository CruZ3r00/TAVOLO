# `docs/sql/` — SQL manuali per Supabase Realtime

Questa cartella contiene SQL **non convertibili in migration Strapi/Knex** perché
dipendono da feature Supabase-specifiche (ruolo `anon`, publication
`supabase_realtime`) che non esistono in un PostgreSQL vanilla. Vanno applicati
**a mano** dall'SQL Editor di Supabase, una volta sola, dopo aver avviato Strapi
sul DB target.

## Quando applicarli
- **Solo su ambienti Supabase**: in PostgreSQL standalone (Docker, RDS senza
  Supabase, on-prem) il flusso realtime non è disponibile e il frontend
  ricade automaticamente sul polling (`Layouts/AppLayout.vue` e
  `Pages/Orders.vue` controllano `isSupabaseRealtimeConfigured` da
  `vuejs/frontend/src/supabase.js`).
- **Dopo `npm run develop` di Strapi**: gli script referenziano tabelle/link
  generate da Strapi (`orders`, `order_items`, `tables`, `reservations`,
  `*_fk_user_lnk`, ecc.) che devono esistere prima.

## File presenti

| File | Cosa fa |
|---|---|
| `realtime_order_events.sql` | Crea `public.order_realtime_events` (event bus minimo per il FE), abilita RLS, crea funzione `emit_order_realtime_event` (PL/pgSQL con `$$` quoting), crea 8 trigger su `orders`/`order_items`/`tables`/`reservations` + relative link tables, aggiunge la tabella alla publication `supabase_realtime`. Variante "moderna" con `$$`. |
| `realtime_relation_link_patch.sql` | Variante alternativa per SQL Editor con limitazioni sul `$$`-quoting: stessa tabella, stesso set di trigger, ma function body in stringa singola con escape. Logica leggermente più compatta (ottimizzata per inserimento batch via SELECT). |
| `harden_supabase_grants.sql` | Revoca i grant larghi da `anon`/`authenticated`, revoca anche i default privileges futuri, e lascia solo `SELECT` su `order_realtime_events` con una policy RLS esplicita. Applicare dopo aver verificato che non esistano altri accessi diretti via Supabase client. |

> **Quale dei due usare?** Se l'SQL Editor di Supabase accetta `$$` (caso
> standard nel 2025+), usare `realtime_order_events.sql`. Se l'editor lamenta
> "syntax error near $$" (vecchie versioni o qualche fork), usare la
> `_relation_link_patch.sql`. Mai applicare entrambi: la seconda esecuzione
> sovrascrive comunque la `emit_order_realtime_event` con la propria versione,
> ma è uno spreco. **Sceglierne uno e standardizzare.**

## Procedura installazione fresca (Postgres + Strapi)

1. Database Postgres vuoto (Supabase o vanilla).
2. `cd strapi && npm run develop` → Strapi crea tutti i content-type tables
   automaticamente da `schema.json`. Le migration JS in `database/migrations/`
   girano subito dopo:
    1. `202604210001_add_operational_indexes.js`
    2. `202605040001_add_order_item_course_fields.js`
    3. `202605060001_add_takeaway_fields.js`
    4. `202605070001_drop_preferences.js` *(no-op su DB nuovo)*
    5. `202605070002_create_restaurant_staff.js` *(crea staff system + functions/triggers)*
    6. `202605070003_category_routing_active_staff_patch.js`
    7. `202605070004_category_routing_manual_assignments_patch.js`
3. **Solo su Supabase**: applicare `realtime_order_events.sql`
   (oppure `realtime_relation_link_patch.sql` se l'editor non supporta `$$`)
   dall'SQL Editor della dashboard Supabase.

## Hardening grant/RLS Supabase

`harden_supabase_grants.sql` e' pensato per DB gia' inizializzato. Non cambia
le tabelle Strapi e non crea una RLS tenant-scoped completa: restringe i grant
dei ruoli Supabase client.

In pratica:
- revoca da `anon` e `authenticated` ogni privilegio diretto su tabelle,
  sequence e funzioni dello schema `public`;
- revoca anche i default privileges futuri, cosi' nuove tabelle/funzioni non
  ereditano automaticamente permessi larghi;
- abilita RLS su `public.order_realtime_events`;
- sostituisce la vecchia policy con una policy `SELECT` esplicita per
  `anon`/`authenticated`;
- ridà solo `SELECT` su `order_realtime_events`, che resta l'event bus minimo
  letto dal frontend Supabase Realtime.

Da applicare solo dopo aver confermato che il frontend non legge direttamente
tabelle applicative Supabase diverse da `order_realtime_events`. I dettagli
ordine/prenotazioni/menu devono continuare a passare da Strapi.

Verifica rapida dopo l'applicazione:

```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

select schemaname, tablename, policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## Storico

In passato questa cartella conteneva anche:
- `order_item_course_fields.sql` → ora migration `202605040001_*`
- `takeaway_fields.sql` → ora migration `202605060001_*`
- `restaurant_staff.sql` → ora migration `202605070002_*`
- `category_routing_active_staff_patch.sql` → ora migration `202605070003_*`
- `category_routing_manual_assignments_patch.sql` → ora migration `202605070004_*`
- `realtime_relation_link_patch_no_dollar.sql` → duplicato (1 commento di
  differenza) di `realtime_relation_link_patch.sql`, rimosso.

Tutti questi file sono stati **convertiti in migrations JS oppure rimossi
come duplicati**: il workflow su un DB pulito ora è completamente automatico
fino al punto realtime.
