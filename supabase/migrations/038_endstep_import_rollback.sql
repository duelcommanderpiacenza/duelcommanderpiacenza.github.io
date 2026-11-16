-- Rollback of 038_endstep_import.sql: the import function and the players'
-- endstep usernames dropped; the archetype required again — fails while an
-- entry has none: set them first (or delete those entries).

drop function if exists replace_event_results(uuid, integer, jsonb, jsonb);

alter table event_entries alter column archetype set not null;

drop index if exists players_endstep_unique;
alter table players drop column if exists endstep;
