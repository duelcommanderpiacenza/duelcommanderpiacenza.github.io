-- Rollback of 042: the rule list without the three. A badge using one turns
-- manual (auto_rule null) first, or the constraint couldn't be added back;
-- its holders in player_badges_auto go at the next badge sync.

update badges set auto_rule = null where auto_rule in ('unbeaten_streak', 'highest_elo', 'giant_slayer');

alter table badges drop constraint if exists badges_auto_rule_valid;
alter table badges add constraint badges_auto_rule_valid check (
  auto_rule is null or auto_rule in (
    'league_winner', 'top8_streak', 'league_rank_1', 'league_rank_2', 'league_rank_3',
    'highest_winrate', 'most_matches_played', 'most_commanders_played', 'completionist',
    'most_byes', 'most_drops', 'commander_loyalty', 'most_draws'
  )
);
