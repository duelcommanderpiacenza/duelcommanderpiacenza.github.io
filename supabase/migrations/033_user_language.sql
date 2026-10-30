-- 033 (2026-10-30): the site's language, remembered for the account.
-- Safe to run again.
--
-- The IT / EN switch (Profilo's Impostazioni, the footer's button —
-- js/language.js) is kept in the browser and, signed in, here, beside the
-- theme and the vibration (migration 019 / 024): 'it' or 'en', null =
-- never chosen (Italian). The table's own policies (each account its own
-- row) already cover the new column.
-- Rollback: 033_user_language_rollback.sql.

alter table user_settings add column if not exists language text
  check (language in ('it', 'en'));
