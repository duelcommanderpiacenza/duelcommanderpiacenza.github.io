-- Rollback of 033_user_language.sql: the saved languages are lost (each
-- browser keeps its own choice).

alter table user_settings drop column if exists language;
