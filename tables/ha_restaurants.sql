create table if not exists ha_restaurants (
    id         bigint primary key generated always as identity,
    name       text not null,
    address    text,
    cuisine    text,
    google_maps_link text,
    latitude   double precision,
    longitude  double precision,
    phone      text,
    website    text,
    notes      text,
    deal       text,
    deal_days  text[],
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table ha_restaurants enable row level security;

create policy "Public read"   on ha_restaurants for select using (true);
create policy "Public insert" on ha_restaurants for insert with check (true);
create policy "Public update" on ha_restaurants for update using (true);
create policy "Public delete" on ha_restaurants for delete using (true);
