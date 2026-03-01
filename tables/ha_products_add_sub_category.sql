-- Add sub_category column to ha_products (free text, for Baby page filters etc).
-- Run this in the Supabase SQL Editor if the table already exists.

alter table ha_products add column if not exists sub_category text;
comment on column ha_products.sub_category is 'Free-text sub category (e.g. for Baby page filters)';
