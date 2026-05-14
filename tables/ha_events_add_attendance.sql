-- Add optional "going / want to go" on ha_events (run once in Supabase SQL Editor).
-- Fixes API error: PGRST204 Could not find the 'attendance' column in the schema cache.

alter table ha_events
  add column if not exists attendance text;

alter table ha_events drop constraint if exists ha_events_attendance_check;

alter table ha_events add constraint ha_events_attendance_check
  check (attendance is null or attendance in ('going', 'want_to_go'));

comment on column ha_events.attendance is 'Personal RSVP-style flag: going | want_to_go | null.';

-- Tell PostgREST to reload the schema (avoids stale cache after ALTER).
notify pgrst, 'reload schema';
