-- Allow appointment as an event type (run once in Supabase SQL Editor).

alter table ha_events drop constraint if exists ha_events_type_check;

alter table ha_events add constraint ha_events_type_check
  check (type in ('concert', 'comedy', 'theatre', 'festival', 'appointment', 'other'));

comment on column ha_events.type is 'Event type: concert | comedy | theatre | festival | appointment | other.';

notify pgrst, 'reload schema';
