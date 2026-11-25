-- 049 (2026-11-25): each player's Elo before and after every event, and
-- their best win in it, in the event_standings cache — player.html's
-- "Statistiche" tab (the Andamento Elo chart, the records "Il balzo più
-- grande" and "Lo scalpo più pesante").
-- Safe to run again.
--
-- Computed by js/elo.js in the same run as player_progress.elo (migration
-- 035) and stored by the admin's sync (admin/js/badges-sync.js) with the
-- rest of event_standings — so after running this, trigger one sync (e.g.
-- save a badge) to fill it. `elo_before`: the rating at the start of the
-- event; `elo_after`: at its end — null for a player with no rated match in
-- it (byes / drops only). `best_win_opponent`: the opponent beaten in it
-- with the highest rating at the time of the match, `best_win_elo` that
-- rating — null without a win. The table's policies already cover the new
-- columns.
-- Rollback: 049_standings_elo_rollback.sql.

alter table event_standings add column if not exists elo_before integer;
alter table event_standings add column if not exists elo_after integer;
alter table event_standings add column if not exists best_win_elo integer;
alter table event_standings add column if not exists best_win_opponent uuid references players(id) on delete set null;
