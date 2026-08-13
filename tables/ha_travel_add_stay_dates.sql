-- Add check-in / check-out dates to hotel & Airbnb options.
-- Run once in Supabase SQL Editor.

alter table ha_trip_stays add column if not exists check_in_date date;
alter table ha_trip_stays add column if not exists check_out_date date;

comment on column ha_trip_stays.check_in_date is 'Booked or planned check-in date';
comment on column ha_trip_stays.check_out_date is 'Booked or planned check-out date';

notify pgrst, 'reload schema';
