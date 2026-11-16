-- 039 (2026-11-16): "Importa da endstep" marks the drops too. Safe to run
-- again.
--
-- A player who played at least one match and then none in the rounds after
-- (endstep: left the tournament) gets our drop row in the round after their
-- last match (matches.is_drop — player2 null, not scored, like the admin's
-- "Drop"). replace_event_results (migration 038) took every match as
-- is_drop false: now each match's own is_drop (false when not given).
-- Rollback: 039_endstep_import_drops_rollback.sql.

create or replace function replace_event_results(
  p_event_id uuid, p_rounds integer, p_entries jsonb, p_matches jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'not allowed';
  end if;
  if not exists (select 1 from events where id = p_event_id and is_online and is_open) then
    raise exception 'the event must be online and open';
  end if;

  create temp table replace_event_results_kept on commit drop as
    select player_id, archetype, bonus_points from event_entries where event_id = p_event_id;

  delete from matches where event_id = p_event_id;
  delete from event_entries where event_id = p_event_id;

  insert into event_entries (event_id, player_id, commander_id, partner_commander_id, archetype, bonus_points, manual_rank)
  select p_event_id, (e->>'player_id')::uuid, (e->>'commander_id')::uuid, (e->>'partner_commander_id')::uuid,
    k.archetype, coalesce(k.bonus_points, 0), (e->>'manual_rank')::integer
  from jsonb_array_elements(p_entries) e
  left join replace_event_results_kept k on k.player_id = (e->>'player_id')::uuid;

  insert into matches (event_id, round, player1_id, player2_id, player1_wins, draws, player2_wins, is_drop)
  select p_event_id, (m->>'round')::integer, (m->>'player1_id')::uuid, (m->>'player2_id')::uuid,
    (m->>'player1_wins')::integer, (m->>'draws')::integer, (m->>'player2_wins')::integer,
    coalesce((m->>'is_drop')::boolean, false)
  from jsonb_array_elements(p_matches) m;

  update events set rounds = greatest(coalesce(p_rounds, 1), 1) where id = p_event_id;
end;
$$;

revoke all on function replace_event_results(uuid, integer, jsonb, jsonb) from public, anon;
grant execute on function replace_event_results(uuid, integer, jsonb, jsonb) to authenticated;
