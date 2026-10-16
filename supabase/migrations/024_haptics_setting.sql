-- 024 — The vibration switch (the footer's, on Android phones —
-- js/haptics-toggle.js) remembered per account, like the theme:
--
-- * user_settings.haptics: true = on, false = off, null = never chosen (this
--   browser's own choice then stays).
-- * user_settings.theme loses its 'system' default and becomes nullable,
--   null = never chosen: a row can now be created just for the vibration
--   switch, and it mustn't read as "the account chose to follow the system"
--   (js/theme.js applies an account's saved theme on sign-in). A theme saved
--   so far keeps its value.
--
-- Run once in the SQL editor (dev first) — before the code that writes
-- haptics goes live. Undo: 024_haptics_setting_rollback.sql.

alter table user_settings alter column theme drop default;
alter table user_settings alter column theme drop not null;
alter table user_settings add column haptics boolean;
