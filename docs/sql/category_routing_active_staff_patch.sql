-- Category routing patch for staff departments.
--
-- Execute on Supabase/Postgres BEFORE deploying the Strapi patch when possible.
-- It is safe to run more than once.
--
-- Rule:
-- - categories are classified automatically only when first seen;
-- - if the classified department is active and unblocked, use it;
-- - otherwise route to cucina;
-- - rows with locked = true are treated as manual choices and are not changed.

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

with desired as (
  select
    routing.id,
    case
      when public.classify_staff_role_for_category(routing.category) = 'cucina' then 'cucina'
      when exists (
        select 1
        from public.restaurant_staff staff
        join public.up_users staff_user on staff_user.id = staff.user_id
        where staff.owner_id = routing.owner_id
          and staff.role = public.classify_staff_role_for_category(routing.category)
          and staff.active = true
          and coalesce(staff_user.blocked, false) = false
      ) then public.classify_staff_role_for_category(routing.category)
      else 'cucina'
    end as staff_role
  from public.restaurant_category_routing routing
  where coalesce(routing.locked, false) = false
)
update public.restaurant_category_routing routing
set staff_role = desired.staff_role,
    updated_at = now()
from desired
where desired.id = routing.id
  and routing.staff_role is distinct from desired.staff_role;
