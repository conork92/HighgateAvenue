-- Add project field to ha_design_ideas (run in Supabase SQL Editor).
-- This field allows tagging ideas as either "Highgate Avenue" or "Muswell Hill".

alter table ha_design_ideas
add column if not exists project text;

comment on column ha_design_ideas.project is 'Project tag: "Highgate Avenue" or "Muswell Hill"';

create index if not exists idx_ha_design_ideas_project on ha_design_ideas(project);
