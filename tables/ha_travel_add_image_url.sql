-- Add optional listing photo URL to stay options (existing installs).
alter table ha_trip_stays add column if not exists image_url text;

notify pgrst, 'reload schema';
