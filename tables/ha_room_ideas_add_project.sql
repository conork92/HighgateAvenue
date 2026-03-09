-- Add project field to ha_room_ideas (run in Supabase SQL Editor).
-- This field allows tagging room ideas as either "Highgate Avenue" or "Muswell Hill".

alter table ha_room_ideas
add column if not exists project text;

comment on column ha_room_ideas.project is 'Project tag: "Highgate Avenue" or "Muswell Hill"';

create index if not exists idx_ha_room_ideas_project on ha_room_ideas(project);
