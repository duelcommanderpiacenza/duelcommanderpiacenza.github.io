-- 040 (2026-11-18): a new automatic badge rule, most_draws — the player(s)
-- with the most drawn matches (js/auto-badges.js, mostDrawsPlayerIds). The
-- rule list is a check constraint: replaced with the same list plus it.
-- Safe to run again. Rollback: 040_badge_most_draws_rollback.sql.

alter table badges drop constraint if exists badges_auto_rule_valid;
alter table badges add constraint badges_auto_rule_valid check (
  auto_rule is null or auto_rule in (
    'league_winner', 'top8_streak', 'league_rank_1', 'league_rank_2', 'league_rank_3',
    'highest_winrate', 'most_matches_played', 'most_commanders_played', 'completionist',
    'league_champion', 'most_byes', 'most_drops', 'commander_loyalty', 'most_draws'
  )
);
