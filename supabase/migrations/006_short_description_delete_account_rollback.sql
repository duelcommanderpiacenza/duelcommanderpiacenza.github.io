-- Undoes 006_short_description_delete_account.sql: drops delete_my_account()
-- and allows 500-character descriptions again (cut text isn't restored).
drop function if exists delete_my_account();
alter table profiles drop constraint profiles_description_check;
alter table profiles add constraint profiles_description_check check (char_length(description) <= 500);
