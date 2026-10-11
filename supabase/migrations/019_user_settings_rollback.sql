-- Undoes 019_user_settings.sql: the saved settings forgotten (the theme then
-- lives only in each browser's own storage again).

drop table if exists user_settings;
