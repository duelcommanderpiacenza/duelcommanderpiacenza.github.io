-- 031: an external event's "Sito" (2026-10-29): where in its town it's
-- played — a shop, a club ("Il Labirinto"); optional, like its Località.
-- Set in the admin's Eventi standalone form; shown on the Bacheca after the
-- Località ("Milano - Il Labirinto"). Rollback: 031_event_venue_rollback.sql.

alter table events add column if not exists venue text;
