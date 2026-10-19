-- 025 — A match is a best-of-3: besides at most 3 games in all, at most 2
-- wins per player (the second win ends it) — 3-0 can't be saved any more.
-- The admin form checks the same (admin/js/matches-admin.js).
--
-- NOT VALID: rows already saved aren't re-checked (a past 3-0 stays as it
-- is), only new and edited ones. To check the old ones too afterwards:
--   alter table matches validate constraint matches_score_valid;
-- (it fails, naming none, if any row breaks it — find them with
--   select * from matches where player1_wins > 2 or player2_wins > 2;)
--
-- Run once in the SQL editor (dev first). Undo: 025_match_max_two_wins_rollback.sql.

alter table matches drop constraint matches_score_valid;
alter table matches add constraint matches_score_valid check (
  player1_wins >= 0 and draws >= 0 and player2_wins >= 0
  and player1_wins <= 2 and player2_wins <= 2
  and (player1_wins + draws + player2_wins) <= 3
) not valid;
