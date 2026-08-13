-- Free-text location label for hotel / Airbnb options (e.g. "Saint-Paul-de-Vence").
alter table ha_trip_stays add column if not exists location_name text;

notify pgrst, 'reload schema';
