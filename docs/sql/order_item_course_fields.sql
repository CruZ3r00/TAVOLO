-- Order item category/course fields for Supabase/Postgres.
--
-- Run from Supabase SQL Editor before using staged order courses in Strapi.
-- Existing rows are preserved and default to first course.

alter table if exists public.order_items
  add column if not exists category varchar(100),
  add column if not exists course integer;

update public.order_items
   set course = 1
 where course is null;

alter table if exists public.order_items
  alter column course set default 1,
  alter column course set not null;

do $$
begin
  if to_regclass('public.order_items') is not null
     and not exists (
       select 1
         from pg_constraint
        where conname = 'order_items_course_range'
          and conrelid = 'public.order_items'::regclass
     ) then
    alter table public.order_items
      add constraint order_items_course_range
      check (course between 1 and 12)
      not valid;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.order_items') is not null
     and exists (
       select 1
         from pg_constraint
        where conname = 'order_items_course_range'
          and conrelid = 'public.order_items'::regclass
          and not convalidated
     ) then
    alter table public.order_items
      validate constraint order_items_course_range;
  end if;
end;
$$;

create index if not exists order_items_course_idx
  on public.order_items (course);
