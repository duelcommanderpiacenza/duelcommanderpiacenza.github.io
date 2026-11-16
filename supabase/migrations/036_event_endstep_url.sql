-- 036 (2026-11-16): an online event's link to its event on endstep.cc.
-- Safe to run again.
--
-- Optional, like results_url (mtgtop8) and decklists_url (Moxfield): set in
-- the admin's event forms (only shown for an online event), shown in the
-- event's "Liste" menu beside the other two. http(s) only — it's rendered
-- as a public link, so a javascript: URL must never get in.
-- Rollback: 036_event_endstep_url_rollback.sql.

alter table events add column if not exists endstep_url text;

alter table events drop constraint if exists events_endstep_url_http;
alter table events add constraint events_endstep_url_http check (endstep_url ~* '^https?://');
