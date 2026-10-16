-- Undoes 024_haptics_setting.sql: no vibration choice per account (each
-- browser keeps its own), and theme back to required, 'system' by default
-- (rows made only for the vibration switch get it).

alter table user_settings drop column if exists haptics;
update user_settings set theme = 'system' where theme is null;
alter table user_settings alter column theme set default 'system';
alter table user_settings alter column theme set not null;
