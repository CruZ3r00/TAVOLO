-- Staff accounts and category routing for restaurant operations.
--
-- Execute on Supabase/Postgres BEFORE deploying the Strapi patch that calls
-- public.sync_owner_staff_accounts(owner_id).
--
-- The paying account remains public.up_users (owner). Staff users never own a
-- Stripe customer/subscription: they are normal Strapi users linked to the
-- owner through Strapi's fk_owner relation table and public.restaurant_staff.
-- restaurant_staff.active is the owner preference. up_users.blocked is derived
-- from owner preference plus the current plan/subscription.

create extension if not exists pgcrypto;

create table if not exists public.restaurant_staff (
  id bigserial primary key,
  owner_id integer not null references public.up_users(id) on delete cascade,
  user_id integer not null references public.up_users(id) on delete cascade,
  role text not null,
  active boolean not null default true,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_staff_not_self check (owner_id <> user_id),
  constraint restaurant_staff_owner_user_unique unique (owner_id, user_id)
);

do $$
begin
  alter table public.restaurant_staff drop constraint if exists restaurant_staff_role_check;
  alter table public.restaurant_staff add constraint restaurant_staff_role_check
    check (role in ('gestione', 'cameriere', 'cucina', 'bar', 'pizzeria', 'cucina_sg'));
end $$;

drop index if exists public.restaurant_staff_owner_role_unique_idx;

create index if not exists restaurant_staff_owner_role_idx
  on public.restaurant_staff (owner_id, role)
  where active = true;

create index if not exists restaurant_staff_user_idx
  on public.restaurant_staff (user_id)
  where active = true;

create table if not exists public.restaurant_category_routing (
  id bigserial primary key,
  owner_id integer not null references public.up_users(id) on delete cascade,
  category text not null,
  category_key text generated always as (lower(btrim(category))) stored,
  staff_role text not null default 'cucina',
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_category_routing_role_check
    check (staff_role in ('cucina', 'bar', 'pizzeria', 'cucina_sg')),
  constraint restaurant_category_routing_owner_category_unique unique (owner_id, category_key)
);

create index if not exists restaurant_category_routing_owner_role_idx
  on public.restaurant_category_routing (owner_id, staff_role);

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

drop trigger if exists restaurant_category_routing_set_updated_at on public.restaurant_category_routing;
create trigger restaurant_category_routing_set_updated_at
before update on public.restaurant_category_routing
for each row execute function public.set_restaurant_staff_updated_at();

alter table public.restaurant_staff enable row level security;
alter table public.restaurant_category_routing enable row level security;

create or replace function public.is_active_tavolo_subscription(
  p_status text,
  p_period_end timestamptz,
  p_end_subscription date
)
returns boolean
language sql
stable
as $$
  select coalesce(p_status, '') in ('active', 'trialing')
    and case
      when p_period_end is not null then p_period_end >= now()
      when p_end_subscription is not null then p_end_subscription >= current_date
      else true
    end;
$$;

create or replace function public.staff_username_for_role(p_owner_id integer, p_owner_username text, p_role text)
returns text
language plpgsql
stable
as $$
declare
  v_restaurant_name text;
  v_base text;
begin
  if to_regclass('public.website_configs') is not null
     and to_regclass('public.website_configs_fk_user_lnk') is not null then
    select wc.restaurant_name into v_restaurant_name
    from public.website_configs wc
    join public.website_configs_fk_user_lnk lnk on lnk.website_config_id = wc.id
    where lnk.user_id = p_owner_id
    order by wc.id desc
    limit 1;
  end if;

  v_base := regexp_replace(
    initcap(regexp_replace(coalesce(nullif(btrim(v_restaurant_name), ''), nullif(btrim(p_owner_username), ''), 'Ristorante'), '[^[:alnum:]]+', ' ', 'g')),
    '[^[:alnum:]]+',
    '',
    'g'
  );

  return concat(
    v_base,
    '.',
    case p_role
      when 'cucina_sg' then 'cucinasg'
      else p_role
    end
  );
end;
$$;

create or replace function public.synthetic_staff_email(p_owner_id integer, p_role text)
returns text
language sql
immutable
as $$
  select concat('staff+', p_owner_id::text, '.', replace(p_role, '_', ''), '@staff.local.tavolo');
$$;

create or replace function public.ensure_owner_role_link(p_staff_id integer, p_owner_id integer)
returns void
language plpgsql
as $$
begin
  if to_regclass('public.up_users_fk_owner_lnk') is not null then
    insert into public.up_users_fk_owner_lnk (user_id, inv_user_id)
    values (p_staff_id, p_owner_id)
    on conflict do nothing;
  end if;
end;
$$;

create or replace function public.copy_owner_auth_role_link(p_staff_id integer, p_owner_id integer)
returns void
language plpgsql
as $$
declare
  v_role_id integer;
begin
  if to_regclass('public.up_users_role_lnk') is null then
    return;
  end if;

  select role_id into v_role_id
  from public.up_users_role_lnk
  where user_id = p_owner_id
  limit 1;

  if v_role_id is not null then
    insert into public.up_users_role_lnk (user_id, role_id)
    values (p_staff_id, v_role_id)
    on conflict do nothing;
  end if;
end;
$$;

create or replace function public.upsert_staff_account(
  p_owner public.up_users,
  p_role text,
  p_enabled boolean
)
returns integer
language plpgsql
as $$
declare
  v_staff_id integer;
  v_username text;
  v_email text;
  v_active boolean;
begin
  v_username := public.staff_username_for_role(p_owner.id, p_owner.username, p_role);
  v_email := public.synthetic_staff_email(p_owner.id, p_role);

  select user_id into v_staff_id
  from public.restaurant_staff
  where owner_id = p_owner.id
    and role = p_role
  limit 1;

  if v_staff_id is null then
    select id into v_staff_id
    from public.up_users
    where username = v_username
    limit 1;
  end if;

  if v_staff_id is null then
    insert into public.up_users (
      document_id,
      username,
      email,
      provider,
      password,
      confirmed,
      blocked,
      name,
      surname,
      staff_role,
      created_at,
      updated_at
    )
    values (
      replace(gen_random_uuid()::text, '-', ''),
      v_username,
      v_email,
      'local',
      p_owner.password,
      true,
      not p_enabled,
      coalesce(nullif(p_owner.name, ''), v_username),
      coalesce(nullif(p_owner.surname, ''), p_role),
      p_role,
      now(),
      now()
    )
    returning id into v_staff_id;
  else
    update public.up_users
    set
      username = case
        when not exists (
          select 1
          from public.up_users existing
          where existing.username = v_username
            and existing.id <> v_staff_id
        ) then v_username
        else username
      end,
      email = coalesce(nullif(email, ''), v_email),
      provider = coalesce(provider, 'local'),
      password = p_owner.password,
      confirmed = true,
      blocked = not p_enabled,
      staff_role = p_role,
      stripe_customer_id = null,
      stripe_subscription_id = null,
      subscription_status = null,
      subscription_plan = null,
      subscription_current_period_end = null,
      subscription_cancel_at_period_end = false,
      end_subscription = null,
      updated_at = now()
    where id = v_staff_id;
  end if;

  perform public.ensure_owner_role_link(v_staff_id, p_owner.id);
  perform public.copy_owner_auth_role_link(v_staff_id, p_owner.id);

  insert into public.restaurant_staff (owner_id, user_id, role, active, display_name)
  values (p_owner.id, v_staff_id, p_role, true, v_username)
  on conflict (owner_id, user_id) do update
  set role = excluded.role,
      display_name = excluded.display_name;

  update public.restaurant_staff
  set active = false
  where owner_id = p_owner.id
    and role = p_role
    and user_id <> v_staff_id;

  select active into v_active
  from public.restaurant_staff
  where owner_id = p_owner.id
    and user_id = v_staff_id
  limit 1;

  update public.up_users
  set blocked = not (coalesce(v_active, true) and p_enabled),
      updated_at = now()
  where id = v_staff_id;

  return v_staff_id;
end;
$$;

create or replace function public.sync_owner_staff_accounts(p_owner_id integer)
returns void
language plpgsql
as $$
declare
  v_owner public.up_users%rowtype;
  v_has_subscription boolean;
  v_is_pro boolean;
  v_is_essential boolean;
  v_role text;
begin
  select * into v_owner
  from public.up_users
  where id = p_owner_id;

  if not found then
    return;
  end if;

  if coalesce(v_owner.staff_role, 'owner') <> 'owner' then
    return;
  end if;

  v_has_subscription := public.is_active_tavolo_subscription(
    v_owner.subscription_status,
    v_owner.subscription_current_period_end,
    v_owner.end_subscription
  );
  v_is_pro := v_has_subscription and coalesce(v_owner.subscription_plan, '') = 'pro';
  v_is_essential := v_has_subscription and coalesce(v_owner.subscription_plan, '') = 'starter';

  perform public.upsert_staff_account(v_owner, 'cameriere', v_is_pro or v_is_essential);
  perform public.upsert_staff_account(v_owner, 'cucina', v_is_pro or v_is_essential);

  update public.up_users staff
  set blocked = not (rs.active and v_is_pro),
      updated_at = now()
  from public.restaurant_staff rs
  where rs.owner_id = v_owner.id
    and rs.role = 'gestione'
    and rs.user_id = staff.id;

  if v_is_pro then
    perform public.upsert_staff_account(v_owner, 'bar', true);
    perform public.upsert_staff_account(v_owner, 'pizzeria', true);
    perform public.upsert_staff_account(v_owner, 'cucina_sg', true);
  else
    for v_role in select unnest(array['bar', 'pizzeria', 'cucina_sg'])
    loop
      update public.up_users staff
      set blocked = true,
          updated_at = now()
      from public.restaurant_staff rs
      where rs.owner_id = v_owner.id
        and rs.role = v_role
        and rs.user_id = staff.id;

    end loop;
  end if;

  if not v_has_subscription then
    update public.up_users staff
    set blocked = true,
        updated_at = now()
    from public.restaurant_staff rs
    where rs.owner_id = v_owner.id
      and rs.user_id = staff.id;

  end if;
end;
$$;

create or replace function public.sync_owner_staff_accounts_trigger()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.staff_role, 'owner') = 'owner' then
    perform public.sync_owner_staff_accounts(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists up_users_sync_staff_after_insert on public.up_users;
create trigger up_users_sync_staff_after_insert
after insert on public.up_users
for each row execute function public.sync_owner_staff_accounts_trigger();

drop trigger if exists up_users_sync_staff_after_subscription_update on public.up_users;
create trigger up_users_sync_staff_after_subscription_update
after update of password, subscription_status, subscription_plan, subscription_current_period_end, end_subscription on public.up_users
for each row
when (coalesce(new.staff_role, 'owner') = 'owner')
execute function public.sync_owner_staff_accounts_trigger();

create or replace function public.classify_staff_role_for_category(p_category text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(coalesce(p_category, ''));
begin
  if v ~ '(bevande|bibite|drink|cocktail|vino|vini|birra|birre|amari|liquori|distillati|aperitivi|bar|caffe|caffè|acqua|soft drink|analcolic)' then
    return 'bar';
  end if;

  if v ~ '(senza glutine|gluten free|gluten-free|sg|celiac|celiach)' then
    return 'cucina_sg';
  end if;

  if v ~ '(pizza|pizze|pizzeria|focaccia|calzone)' then
    return 'pizzeria';
  end if;

  return 'cucina';
end;
$$;

create or replace function public.ensure_restaurant_category_routing(
  p_owner_id integer,
  p_category text
)
returns void
language plpgsql
as $$
declare
  v_category text := nullif(btrim(coalesce(p_category, '')), '');
  v_role text;
  v_role_available boolean;
begin
  if p_owner_id is null or v_category is null then
    return;
  end if;

  v_role := public.classify_staff_role_for_category(v_category);

  if v_role <> 'cucina' then
    select exists (
      select 1
      from public.restaurant_staff staff
      join public.up_users staff_user on staff_user.id = staff.user_id
      where staff.owner_id = p_owner_id
        and staff.role = v_role
        and staff.active = true
        and coalesce(staff_user.blocked, false) = false
    ) into v_role_available;

    if not coalesce(v_role_available, false) then
      v_role := 'cucina';
    end if;
  end if;

  insert into public.restaurant_category_routing (owner_id, category, staff_role)
  values (p_owner_id, v_category, v_role)
  on conflict (owner_id, category_key) do nothing;
end;
$$;

create or replace function public.route_category_from_element_link()
returns trigger
language plpgsql
as $$
declare
  v_category text;
begin
  select category into v_category
  from public.elements
  where id = new.element_id;

  perform public.ensure_restaurant_category_routing(new.user_id, v_category);
  return new;
end;
$$;

create or replace function public.route_category_from_element_update()
returns trigger
language plpgsql
as $$
declare
  v_owner_id integer;
begin
  if new.category is null or new.category is not distinct from old.category then
    return new;
  end if;

  if to_regclass('public.elements_fk_user_lnk') is not null then
    select user_id into v_owner_id
    from public.elements_fk_user_lnk
    where element_id = new.id
    limit 1;
  end if;

  perform public.ensure_restaurant_category_routing(v_owner_id, new.category);
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.elements_fk_user_lnk') is not null then
    drop trigger if exists elements_category_routing_after_link on public.elements_fk_user_lnk;
    create trigger elements_category_routing_after_link
    after insert on public.elements_fk_user_lnk
    for each row execute function public.route_category_from_element_link();
  end if;
end $$;

drop trigger if exists elements_category_routing_after_update on public.elements;
create trigger elements_category_routing_after_update
after update of category on public.elements
for each row execute function public.route_category_from_element_update();

-- Backfill existing staff mappings.
insert into public.restaurant_staff (owner_id, user_id, role, display_name)
select owner.id, staff.id, staff.staff_role, staff.username
from public.up_users staff
join public.up_users_fk_owner_lnk owner_lnk on owner_lnk.user_id = staff.id
join public.up_users owner on owner.id = owner_lnk.inv_user_id
where staff.staff_role in ('gestione', 'cameriere', 'cucina', 'bar', 'pizzeria', 'cucina_sg')
on conflict (owner_id, user_id) do update
set role = excluded.role,
    display_name = excluded.display_name,
    active = true;

-- Backfill routing for existing element categories.
insert into public.restaurant_category_routing (owner_id, category, staff_role)
select distinct lnk.user_id, el.category, public.classify_staff_role_for_category(el.category)
from public.elements el
join public.elements_fk_user_lnk lnk on lnk.element_id = el.id
where nullif(btrim(coalesce(el.category, '')), '') is not null
on conflict (owner_id, category_key) do nothing;

-- Reconcile all current owners at the end of the migration.
do $$
declare
  v_owner_id integer;
begin
  for v_owner_id in
    select id from public.up_users where coalesce(staff_role, 'owner') = 'owner'
  loop
    perform public.sync_owner_staff_accounts(v_owner_id);
  end loop;
end $$;
