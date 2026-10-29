-- 031 (2026-10-29): an external event's "Sito", and external events allowed
-- to share a name. Safe to run again (e.g. if its first part was already run).
--
-- "Sito": where in its town it's played — a shop, a club ("Il Labirinto");
-- optional, like its Località. Set in the admin's Eventi standalone form;
-- shown on the Bacheca after the Località ("Milano - Il Labirinto").
--
-- Names: a standalone event's name stays unique among the ordinary ones,
-- but an external event only needs to differ in name, date, Località or Sito
-- from the other external ones (the same "Qualifier" in two towns, or on two
-- dates) — empty values counting as equal (nulls not distinct).
-- Rollback: 031_event_venue_rollback.sql.

alter table events add column if not exists venue text;

drop index if exists events_unique_standalone_name;
create unique index if not exists events_unique_standalone_name
  on events (name) where league_id is null and not is_external;
create unique index if not exists events_unique_external
  on events (name, event_date, location, venue) nulls not distinct where is_external;
