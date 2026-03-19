-- Migration: make bok_likes nullable with default null.
-- Run in Supabase SQL Editor. Existing rows keep current values (true/false);
-- new rows get null so they appear in the Bok Likes swipe queue.

alter table ha_products
  alter column bok_likes drop not null,
  alter column bok_likes set default null;

comment on column ha_products.bok_likes is 'Muswell Hill: book/likes – true = like, false = pass, null = not yet decided (shown in Bok Likes swipe)';
