-- Rollback of 049_standings_elo.sql: the per-event ratings and best wins are lost
-- (recomputed by the next sync if the columns come back).

alter table event_standings drop column if exists elo_before;
alter table event_standings drop column if exists elo_after;
alter table event_standings drop column if exists best_win_elo;
alter table event_standings drop column if exists best_win_opponent;
