-- 035 (2026-11-03): each player's Elo rating, in the player_progress cache.
-- Safe to run again.
--
-- Computed by js/elo.js over every closed event (online ones left out),
-- match-level, everyone starting at 1500, and stored by the admin's sync
-- (admin/js/badges-sync.js) with the rest of player_progress — so after
-- running this, trigger one sync (e.g. save a badge) to fill it. `elo`: the
-- rating now; `elo_before`: at the start of the player's latest event (the
-- trend arrow on Giocatori). Null for a player with
-- no rated match (byes / drops only). The table's policies already cover
-- the new columns.
-- Rollback: 035_player_elo_rollback.sql.

alter table player_progress add column if not exists elo integer;
alter table player_progress add column if not exists elo_before integer;
