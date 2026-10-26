-- Hand luggage owner: conor, cian, rebecca, or shared.
alter table ha_trip_packing_items add column if not exists person text not null default 'shared'
  check (person in ('shared', 'conor', 'cian', 'rebecca'));

notify pgrst, 'reload schema';
