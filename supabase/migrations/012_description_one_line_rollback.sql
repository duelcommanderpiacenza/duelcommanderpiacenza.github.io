-- Undoes 012_description_one_line.sql: descriptions up to 140 characters
-- again, line breaks allowed (text cut or joined by 012 isn't restored).
alter table profiles drop constraint profiles_description_check;
alter table profiles add constraint profiles_description_check check (char_length(description) <= 140);
