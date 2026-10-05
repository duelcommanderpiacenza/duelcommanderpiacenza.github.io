-- Undoes 005_profile_show_avatar.sql.
alter table profiles drop column if exists show_avatar;
