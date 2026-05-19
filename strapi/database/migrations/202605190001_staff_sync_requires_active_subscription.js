'use strict';

/**
 * Staff accounts are generated only after the owner has an active Stripe
 * subscription. A plain owner insert during registration must not create
 * synthetic staff rows, because registration can still be rolled back before
 * WebsiteConfig or checkout completes.
 */

module.exports = {
  async up(knex) {
    await knex.raw(`
create or replace function public.sync_owner_staff_accounts(p_owner_id integer)
returns void
language plpgsql
as $fn$
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

  if not v_has_subscription then
    update public.up_users staff
    set blocked = true,
        updated_at = now()
    from public.restaurant_staff rs
    where rs.owner_id = v_owner.id
      and rs.user_id = staff.id;
    return;
  end if;

  perform public.upsert_staff_account(v_owner, 'cameriere', v_is_pro or v_is_essential);
  update public.restaurant_staff
  set active = true
  where owner_id = v_owner.id
    and role = 'cameriere';

  perform public.upsert_staff_account(v_owner, 'cucina', v_is_pro or v_is_essential);

  update public.up_users staff
  set blocked = not (v_is_pro or v_is_essential),
      updated_at = now()
  from public.restaurant_staff rs
  where rs.owner_id = v_owner.id
    and rs.role in ('cameriere', 'cucina')
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
end;
$fn$;

create or replace function public.sync_owner_staff_accounts_trigger()
returns trigger
language plpgsql
as $fn$
begin
  if coalesce(new.staff_role, 'owner') = 'owner' then
    perform public.sync_owner_staff_accounts(new.id);
  end if;
  return new;
end;
$fn$;

delete from public.up_users_role_lnk role_lnk
using public.restaurant_staff staff
left join public.up_users owner on owner.id = staff.owner_id
join public.up_users staff_user on staff_user.id = staff.user_id
where owner.id is null
  and staff_user.email like 'staff+%.%@staff.local.tavolo'
  and role_lnk.user_id = staff.user_id;

delete from public.up_users_fk_owner_lnk owner_lnk
using public.restaurant_staff staff
left join public.up_users owner on owner.id = staff.owner_id
join public.up_users staff_user on staff_user.id = staff.user_id
where owner.id is null
  and staff_user.email like 'staff+%.%@staff.local.tavolo'
  and owner_lnk.user_id = staff.user_id;

delete from public.restaurant_staff staff
using public.up_users staff_user
where staff.user_id = staff_user.id
  and staff_user.email like 'staff+%.%@staff.local.tavolo'
  and not exists (
    select 1 from public.up_users owner where owner.id = staff.owner_id
  );

delete from public.up_users staff_user
where staff_user.email like 'staff+%.%@staff.local.tavolo'
  and not exists (
    select 1 from public.restaurant_staff staff where staff.user_id = staff_user.id
  );
    `);
  },

  async down() {
    // Irreversibile: later migrations own the canonical sync function.
  },
};
