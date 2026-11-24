-- Rollback of 047_achievements.sql: the achievements' tables, trigger and
-- functions go, with every unlock and "seen" record in them.

drop trigger if exists profiles_record_card_saved on profiles;
drop function if exists record_card_saved();
drop function if exists site_achievements_of(uuid);
drop function if exists my_achievements();
drop function if exists record_site_achievements(uuid, boolean);
drop table if exists achievements_seen;
drop table if exists account_achievements;
drop table if exists player_achievements;
