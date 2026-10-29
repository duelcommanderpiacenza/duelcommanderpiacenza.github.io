-- Rollback of 030_delete_past_external_events.sql: the nightly job stopped.
-- The events it (or the migration) deleted can't come back.

select cron.unschedule('delete-past-external-events');
