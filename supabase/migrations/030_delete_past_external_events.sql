-- 030: external events (played somewhere else, migration 026 — only
-- announced on the Bacheca) deleted once their day is over (2026-10-29).
-- A nightly pg_cron job, like the announcements' one: every external event
-- whose event_date is before today, at 03:20 UTC — the night after its day
-- (an external event has no entries / matches; anything else pointing at
-- it goes with it, on delete cascade). One without a date stays.
-- Rollback: 030_delete_past_external_events_rollback.sql (the job stopped —
-- the deleted events can't come back).

create extension if not exists pg_cron;

select cron.schedule(
  'delete-past-external-events',
  '20 3 * * *',
  $$delete from events where is_external and event_date < current_date$$
);

-- The ones already past, now.
delete from events where is_external and event_date < current_date;
