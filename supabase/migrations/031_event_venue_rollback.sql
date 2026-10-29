-- Rollback of 031_event_venue.sql: the old name rule back (every standalone
-- event's name unique — fails while two external events share one: rename
-- or delete one first), and the venue column dropped, with its values.

drop index if exists events_unique_external;
drop index if exists events_unique_standalone_name;
create unique index events_unique_standalone_name on events (name) where league_id is null;

alter table events drop column if exists venue;
