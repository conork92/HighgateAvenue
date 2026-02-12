-- Add removed flag to ha_design_ideas (run in Supabase SQL Editor).
-- When true, the idea is hidden from lists; user can "X" ideas they don't want to see.

alter table ha_design_ideas
add column if not exists removed boolean not null default false;

comment on column ha_design_ideas.removed is 'When true, idea is hidden from design/categorize views (user chose to remove it).';
