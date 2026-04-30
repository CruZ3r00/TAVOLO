-- Staff accounts for restaurant operations.
--
-- The paying account remains public.up_users (owner). Each staff login is a
-- normal Strapi user linked here to the owner restaurant it operates on.

create table if not exists public.restaurant_staff (
  id bigserial primary key,
  owner_id integer not null references public.up_users(id) on delete cascade,
  user_id integer not null references public.up_users(id) on delete cascade,
  role text not null check (role in ('gestione', 'cameriere', 'cucina')),
  active boolean not null default true,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_staff_not_self check (owner_id <> user_id),
  constraint restaurant_staff_owner_user_unique unique (owner_id, user_id)
);

create index if not exists restaurant_staff_owner_role_idx
  on public.restaurant_staff (owner_id, role)
  where active = true;

create index if not exists restaurant_staff_user_idx
  on public.restaurant_staff (user_id)
  where active = true;

create or replace function public.set_restaurant_staff_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists restaurant_staff_set_updated_at on public.restaurant_staff;
create trigger restaurant_staff_set_updated_at
before update on public.restaurant_staff
for each row execute function public.set_restaurant_staff_updated_at();

alter table public.restaurant_staff enable row level security;

-- Strapi connects server-side with the database credentials. Do not expose staff
-- mappings through the anon key; frontend access goes through Strapi APIs.

insert into public.restaurant_staff (owner_id, user_id, role, display_name)
select owner.id, staff.id, staff.staff_role, staff.username
from public.up_users staff
join public.up_users_fk_owner_lnk owner_lnk on owner_lnk.user_id = staff.id
join public.up_users owner on owner.id = owner_lnk.inv_user_id
where staff.staff_role in ('gestione', 'cameriere', 'cucina')
on conflict (owner_id, user_id) do update
set role = excluded.role,
    display_name = excluded.display_name,
    active = true;
