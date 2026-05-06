-- Campi Asporto per Supabase/Postgres.
-- Eseguire prima di usare la nuova gestione asporto in ambienti dove
-- Strapi non applica automaticamente le migrazioni.

alter table if exists public.orders
  add column if not exists service_type varchar(32) not null default 'table',
  add column if not exists takeaway_status varchar(40),
  add column if not exists customer_name varchar(120),
  add column if not exists customer_phone varchar(32),
  add column if not exists customer_email varchar(255),
  add column if not exists pickup_at timestamptz,
  add column if not exists sent_to_departments_at timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists picked_up_at timestamptz;

alter table if exists public.reservations
  add column if not exists customer_email varchar(255);

alter table if exists public.order_archives
  add column if not exists service_type varchar(32) not null default 'table',
  add column if not exists customer_phone varchar(32),
  add column if not exists customer_email varchar(255),
  add column if not exists pickup_at timestamptz;

alter table if exists public.restaurant_daily_stats
  add column if not exists takeaway_count integer not null default 0;

create index if not exists idx_orders_service_status_pickup
  on public.orders (service_type, status, pickup_at);
