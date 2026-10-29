-- Rollback of 031_event_venue.sql: the column dropped, with its values.

alter table events drop column if exists venue;
