-- Add project field to ha_products (run in Supabase SQL Editor).
-- This field allows tagging products as either "Highgate Avenue" or "Muswell Hill".

alter table ha_products
add column if not exists project text;

comment on column ha_products.project is 'Project tag: "Highgate Avenue" or "Muswell Hill"';

create index if not exists idx_ha_products_project on ha_products(project);
