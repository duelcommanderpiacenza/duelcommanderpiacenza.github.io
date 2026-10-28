-- 029: "Segui" removed from the site (2026-10-28 — barely used: one
-- account out of 13). The follows table goes, with its rows (the ★ on
-- player / commander / league pages and the profile's "Seguiti" were its
-- only users). Rollback: 029_drop_follows_rollback.sql (the table back,
-- empty — the rows are gone for good).

drop table if exists follows;
