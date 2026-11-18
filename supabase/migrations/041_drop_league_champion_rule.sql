-- 041 (2026-11-18): the league_champion badge rule ("Leggendario": won at
-- least one league, kept for good) dropped — badges are meant to pass from
-- one player to another, and that one never did. The badge itself was
-- already made manual and held by nobody; any badge still on the rule turns
-- manual first, then the rule list is the same without it. Safe to run
-- again. Rollback: 041_drop_league_champion_rule_rollback.sql.

update badges set auto_rule = null where auto_rule = 'league_champion';

alter table badges drop constraint if exists badges_auto_rule_valid;
alter table badges add constraint badges_auto_rule_valid check (
  auto_rule is null or auto_rule in (
    'league_winner', 'top8_streak', 'league_rank_1', 'league_rank_2', 'league_rank_3',
    'highest_winrate', 'most_matches_played', 'most_commanders_played', 'completionist',
    'most_byes', 'most_drops', 'commander_loyalty', 'most_draws'
  )
);
