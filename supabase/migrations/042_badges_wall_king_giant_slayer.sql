-- 042 (2026-11-18): three new automatic badge rules (js/auto-badges.js):
-- unbeaten_streak ("Muro": the longest current run of matches without a
-- loss), highest_elo ("Il Re": the highest Elo), giant_slayer
-- ("Ammazzagiganti": the most wins against the current Elo top 5 in the
-- last 6 months, with no more losses than wins against them, the top 5
-- themselves left out). The rule list
-- is a check constraint: replaced with the same list plus them. Safe to run
-- again. Rollback: 042_badges_wall_king_giant_slayer_rollback.sql.

alter table badges drop constraint if exists badges_auto_rule_valid;
alter table badges add constraint badges_auto_rule_valid check (
  auto_rule is null or auto_rule in (
    'league_winner', 'top8_streak', 'league_rank_1', 'league_rank_2', 'league_rank_3',
    'highest_winrate', 'most_matches_played', 'most_commanders_played', 'completionist',
    'most_byes', 'most_drops', 'commander_loyalty', 'most_draws',
    'unbeaten_streak', 'highest_elo', 'giant_slayer'
  )
);
