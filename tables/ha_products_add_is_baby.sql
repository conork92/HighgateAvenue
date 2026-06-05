-- Baby page flag. Run once in Supabase SQL Editor.

alter table ha_products add column if not exists is_baby boolean not null default false;

comment on column ha_products.is_baby is 'Baby item: show on /baby/ (use sub_category for type: Clothes, Toys, etc.).';

create index if not exists idx_ha_products_is_baby on ha_products (is_baby) where is_baby;

update ha_products
set is_baby = true
where is_baby = false
  and (
    lower(trim(coalesce(category, ''))) = 'baby'
    or coalesce(tags, '{}') @> array['baby']::text[]
  );

notify pgrst, 'reload schema';
