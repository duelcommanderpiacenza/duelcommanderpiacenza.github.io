-- Rollback of 041: league_champion back in the rule list (its code in
-- js/auto-badges.js is in git history, before this migration's commit).
-- A badge using it has to be set to it again in the admin.

alter table badges drop constraint if exists badges_auto_rule_valid;
alter table badges add constraint badges_auto_rule_valid check (
  auto_rule is null or auto_rule in (
    'league_winner', 'top8_streak', 'league_rank_1', 'league_rank_2', 'league_rank_3',
    'highest_winrate', 'most_matches_played', 'most_commanders_played', 'completionist',
    'league_champion', 'most_byes', 'most_drops', 'commander_loyalty', 'most_draws'
  )
);
