-- Persistent category routing patch.
--
-- Safe to run multiple times on Supabase/Postgres.
--
-- Rules:
-- - the waiter department is always active while the owner subscription is valid;
-- - new categories are classified automatically only on first sight;
-- - manual owner assignments set locked = true and are never overwritten here;
-- - Starter/Essenziale routing override is enforced by the Strapi API at read time:
--   all order items are treated as Cucina regardless of saved category routing.

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
begin
  if p_owner_id is null or v_category is null then
    return;
  end if;

  v_role := public.classify_staff_role_for_category(v_category);

  insert into public.restaurant_category_routing (owner_id, category, staff_role, locked)
  values (p_owner_id, v_category, v_role, false)
  on conflict (owner_id, category_key) do nothing;
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
  update public.restaurant_staff
  set active = true
  where owner_id = v_owner.id
    and role = 'cameriere';

  perform public.upsert_staff_account(v_owner, 'cucina', v_is_pro or v_is_essential);

  update public.up_users staff
  set blocked = not (v_has_subscription and (v_is_pro or v_is_essential)),
      updated_at = now()
  from public.restaurant_staff rs
  where rs.owner_id = v_owner.id
    and rs.role = 'cameriere'
    and rs.user_id = staff.id;

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
