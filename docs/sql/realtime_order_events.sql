-- Supabase Realtime bridge for Sala/Cucina/Cassa.
--
-- Do not expose Strapi order tables to the anon key. This table carries only a
-- minimal "something changed" event; the frontend still refetches through
-- authenticated Strapi APIs.

create table if not exists public.order_realtime_events (
  id bigserial primary key,
  user_id integer not null,
  source_table text not null,
  source_id integer,
  event_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists order_realtime_events_user_created_idx
  on public.order_realtime_events (user_id, created_at desc);

alter table public.order_realtime_events enable row level security;

drop policy if exists "anon can read order realtime events" on public.order_realtime_events;
create policy "anon can read order realtime events"
  on public.order_realtime_events
  for select
  to anon
  using (true);

create or replace function public.emit_order_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_id integer;
  v_order_id integer;
  v_user_id integer;
begin
  if TG_TABLE_NAME = 'orders' then
    v_order_id := coalesce(NEW.id, OLD.id);
    v_source_id := v_order_id;
  elsif TG_TABLE_NAME = 'order_items' then
    v_source_id := coalesce(NEW.id, OLD.id);

    select l.order_id
      into v_order_id
      from public.order_items_fk_order_lnk l
     where l.order_item_id = v_source_id
     limit 1;
  elsif TG_TABLE_NAME = 'tables' then
    v_source_id := coalesce(NEW.id, OLD.id);

    select l.user_id
      into v_user_id
      from public.tables_fk_user_lnk l
     where l.table_id = v_source_id
     limit 1;
  elsif TG_TABLE_NAME = 'reservations' then
    v_source_id := coalesce(NEW.id, OLD.id);

    select l.user_id
      into v_user_id
      from public.reservations_fk_user_lnk l
     where l.reservation_id = v_source_id
     limit 1;
  else
    return coalesce(NEW, OLD);
  end if;

  if v_user_id is null and v_order_id is not null then
    select l.user_id
      into v_user_id
      from public.orders_fk_user_lnk l
     where l.order_id = v_order_id
     limit 1;
  end if;

  if v_user_id is not null then
    insert into public.order_realtime_events (user_id, source_table, source_id, event_type)
    values (v_user_id, TG_TABLE_NAME, v_source_id, TG_OP);
  end if;

  delete from public.order_realtime_events
   where created_at < now() - interval '1 day';

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists orders_realtime_event_trigger on public.orders;
create trigger orders_realtime_event_trigger
after insert or update or delete on public.orders
for each row execute function public.emit_order_realtime_event();

drop trigger if exists order_items_realtime_event_trigger on public.order_items;
create trigger order_items_realtime_event_trigger
after insert or update or delete on public.order_items
for each row execute function public.emit_order_realtime_event();

drop trigger if exists tables_realtime_event_trigger on public.tables;
create trigger tables_realtime_event_trigger
after insert or update or delete on public.tables
for each row execute function public.emit_order_realtime_event();

drop trigger if exists reservations_realtime_event_trigger on public.reservations;
create trigger reservations_realtime_event_trigger
after insert or update or delete on public.reservations
for each row execute function public.emit_order_realtime_event();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
         from pg_publication_rel pr
         join pg_publication p on p.oid = pr.prpubid
         join pg_class c on c.oid = pr.prrelid
         join pg_namespace n on n.oid = c.relnamespace
        where p.pubname = 'supabase_realtime'
          and n.nspname = 'public'
          and c.relname = 'order_realtime_events'
     ) then
    alter publication supabase_realtime add table public.order_realtime_events;
  end if;
end;
$$;
