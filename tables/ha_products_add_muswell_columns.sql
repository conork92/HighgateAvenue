-- Add Muswell Hill product flags to ha_products.
-- Run this in the Supabase SQL Editor.

alter table ha_products add column if not exists bok_likes boolean not null default false;
alter table ha_products add column if not exists x_remove boolean not null default false;
alter table ha_products add column if not exists is_mwh boolean not null default false;
alter table ha_products add column if not exists bought boolean not null default false;

comment on column ha_products.bok_likes is 'Muswell Hill: book/likes flag';
comment on column ha_products.x_remove is 'Muswell Hill: exclude/remove from consideration';
comment on column ha_products.is_mwh is 'Muswell Hill: true if product is for MWH, or when tag mwh is present';
comment on column ha_products.bought is 'Mark as bought; shown in Bought section at bottom';
