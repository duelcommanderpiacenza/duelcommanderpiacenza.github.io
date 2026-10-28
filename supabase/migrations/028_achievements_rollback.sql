-- Rollback of 028_achievements.sql: the achievements' tables and functions
-- go, with every unlock and "seen" record in them.

drop function if exists site_achievements_of(uuid);
drop function if exists my_achievements();
drop table if exists achievements_seen;
drop table if exists account_achievements;
drop table if exists player_achievements;
