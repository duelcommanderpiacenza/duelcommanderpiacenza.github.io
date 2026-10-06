-- Undoes 011_player_progress.sql: no more progress cache (the player cards
-- just show no cosmetics).
drop table if exists player_progress;
