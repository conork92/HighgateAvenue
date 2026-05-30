-- Who a present is for (free text). Run once in Supabase SQL Editor.
-- Present items should also have tag "present" in ha_products.tags.

alter table ha_products add column if not exists present_for text;

comment on column ha_products.present_for is 'Recipient name for present-tagged products (free text).';

notify pgrst, 'reload schema';
