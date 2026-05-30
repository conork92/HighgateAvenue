-- Presents page flag (simpler than relying on tags). Run once in Supabase SQL Editor.

alter table ha_products add column if not exists is_present boolean not null default false;

comment on column ha_products.is_present is 'Gift idea: show on /presents/ (set true when adding via Presents or backfill).';

create index if not exists idx_ha_products_is_present on ha_products (is_present) where is_present;

-- Backfill: existing gift rows (person set and/or legacy present tag)
update ha_products
set is_present = true
where is_present = false
  and (
    (present_for is not null and trim(present_for) <> '')
    or coalesce(tags, '{}') @> array['present']::text[]
  );

-- Optional: mark specific products you added on All Products as presents, e.g.:
-- update ha_products set is_present = true where id in (301, 302, 303);

notify pgrst, 'reload schema';
