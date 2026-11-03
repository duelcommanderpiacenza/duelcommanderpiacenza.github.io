-- Rollback of 035_player_elo.sql: the ratings are lost (recomputed by the
-- next sync if the columns come back).

alter table player_progress drop column if exists elo;
alter table player_progress drop column if exists elo_before;
