'use strict';

/**
 * Patch v1 della funzione `ensure_restaurant_category_routing`:
 *   - le categorie sono classificate automaticamente solo alla prima vista;
 *   - se il dipartimento classificato è attivo e non bloccato, viene usato;
 *   - altrimenti il routing fallback è cucina;
 *   - le righe con `locked = true` sono scelte manuali e non vengono toccate.
 *
 * Inoltre forza il re-routing delle righe NON locked verso il dipartimento
 * disponibile più appropriato.
 *
 * Idempotente: CREATE OR REPLACE FUNCTION + UPDATE condizionato.
 *
 * Storia: prima dell'introduzione di questa migration, lo script viveva
 * come `docs/sql/category_routing_active_staff_patch.sql`.
 */

module.exports = {
  async up(knex) {
    await knex.raw(`
create or replace function public.ensure_restaurant_category_routing(
  p_owner_id integer,
  p_category text
)
returns void
language plpgsql
as $fn$
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
$fn$;

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
    `);
  },

  async down() {
    // Irreversibile.
  },
};
