-- 026 — External events: a standalone event played somewhere else, only
-- announced on the public Bacheca (its upcoming events; a past one only
-- with its mtgtop8 / Moxfield link). No entries, matches or open/closed
-- state of its own: it stays is_open = true for good (so no "played"
-- list anywhere picks it up — those take closed events only), and visitors
-- can still see it once its date has passed (the Bacheca's past ones).
--   is_external — set in the admin's Eventi standalone form;
--   location    — "Località", shown under its name (optional).
-- Read with js/db.js's Events.listExternal(); Events.list() / listUpcoming()
-- leave external events out.
--
-- Run once in the SQL editor (dev first). Undo: 026_external_events_rollback.sql.

alter table events add column is_external boolean not null default false;
alter table events add column location text;

-- Standalone only, and never closed.
alter table events add constraint events_external_standalone check (not is_external or league_id is null);
alter table events add constraint events_external_open check (not is_external or is_open);

-- Visitors: as before, plus an external event whatever its date.
drop policy "events_public_read" on events;
create policy "events_public_read" on events for select
  using (is_open = false or event_date >= current_date or is_external or is_admin());
