-- Add comment column to ha_products (for product notes).
-- Run this in the Supabase SQL Editor if the table already exists.

alter table ha_products add column if not exists comment text;
comment on column ha_products.comment is 'Optional notes or comments for the product';
