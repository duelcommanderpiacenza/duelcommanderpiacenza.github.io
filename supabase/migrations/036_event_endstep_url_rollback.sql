-- Rollback of 036_event_endstep_url.sql: the column dropped, with its links
-- (and its check constraint with it).

alter table events drop column if exists endstep_url;
