-- Harden Supabase anon/authenticated grants for the Strapi database.
--
-- Strapi connects with DATABASE_USERNAME and does not need the Supabase
-- `anon`/`authenticated` roles to have table-wide DML on application tables.
-- The frontend currently uses Supabase only for Realtime on
-- `public.order_realtime_events`, then refetches details through Strapi.
--
-- Apply manually after confirming no other Supabase client paths use direct
-- table access. Run as the role that owns the Strapi tables, usually `postgres`
-- in the Supabase SQL Editor.
--
-- Note: ALTER DEFAULT PRIVILEGES only affects objects created by the current
-- role. If Strapi creates future tables with a different DB owner, repeat the
-- default-privileges section with:
--   alter default privileges for role <strapi_db_owner> in schema public ...

begin;

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all tables in schema public from authenticated;
revoke all privileges on all sequences in schema public from anon;
revoke all privileges on all sequences in schema public from authenticated;
revoke all privileges on all functions in schema public from anon;
revoke all privileges on all functions in schema public from authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on sequences from authenticated;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on functions from authenticated;

alter table public.order_realtime_events enable row level security;

drop policy if exists "anon can read order realtime events" on public.order_realtime_events;
drop policy if exists "realtime events are readable by supabase clients" on public.order_realtime_events;
create policy "realtime events are readable by supabase clients"
  on public.order_realtime_events
  for select
  to anon, authenticated
  using (true);

grant select on table public.order_realtime_events to anon;
grant select on table public.order_realtime_events to authenticated;

commit;
