-- Undoes 018_follow_leagues.sql: the followed leagues deleted, the column
-- dropped, and the two-way check of 010 back.

delete from follows where league_id is not null;

alter table follows drop constraint if exists follows_one_target;

alter table follows drop column league_id;

alter table follows
  add check ((player_id is null) <> (commander_id is null));
