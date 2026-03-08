-- Supabase/PostgreSQL: Pinterest board URL per room.
-- Run in Supabase SQL Editor.

create table if not exists ha_room_pinterest (
  room_slug text primary key,
  board_url text not null,
  updated_at timestamptz default now()
);

comment on table ha_room_pinterest is 'Pinterest board URL per Muswell Hill room (e.g. kitchen)';

-- Optional: seed Kitchen test board (run once if you want it pre-set)
-- insert into ha_room_pinterest (room_slug, board_url) values ('kitchen', 'https://uk.pinterest.com/?tabId=648448115038008539') on conflict (room_slug) do update set board_url = excluded.board_url, updated_at = now();
