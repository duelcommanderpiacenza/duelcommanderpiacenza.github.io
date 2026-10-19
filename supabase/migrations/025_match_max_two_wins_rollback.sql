-- Undoes 025_match_max_two_wins.sql: back to just "at most 3 games in all".

alter table matches drop constraint matches_score_valid;
alter table matches add constraint matches_score_valid check (
  player1_wins >= 0 and draws >= 0 and player2_wins >= 0
  and (player1_wins + draws + player2_wins) <= 3
);
