-- RPC: same logic as the SQL that works in Supabase SQL Editor.
-- Run this in Supabase SQL Editor once, then the API can call supabase.rpc('get_muswell_hill_products').

create or replace function get_muswell_hill_products()
returns setof ha_products
language sql
stable
as $$
  SELECT p.*
  FROM ha_products p
  WHERE p.is_mwh = true
     OR 'mwh' = ANY(p.tags)
  ORDER BY p.created_at DESC;
$$;

-- Grant execute to anon and authenticated so the API key can call it
grant execute on function get_muswell_hill_products() to anon;
grant execute on function get_muswell_hill_products() to authenticated;
