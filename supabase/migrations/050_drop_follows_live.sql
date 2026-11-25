-- 050 (2026-11-25): migration 029 again ("Segui" removed from the site on
-- 2026-10-28) — it was run on dcp-dev but never on live, where the follows
-- table was still there (3 rows, its 3 policies; checked 2026-11-25: nothing
-- else uses it — no foreign key to it, no function, view or trigger). The
-- table goes with its rows (a backup of live from 2026-11-25 has them).
-- Safe on dcp-dev too (nothing to drop) and to run again.
-- Rollback: 050_drop_follows_live_rollback.sql (the table back, empty).

drop table if exists follows;
