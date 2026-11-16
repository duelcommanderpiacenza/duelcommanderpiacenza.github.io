-- 038 (2026-11-16): importing an online event's results from endstep.cc.
-- Safe to run again.
--
-- The admin's "Importa da endstep" (admin/js/endstep-import.js, through the
-- endstep-import Edge Function) reads the tournament behind an online
-- event's endstep_url (migration 036) — its entrants, every round's
-- pairings with their game scores, each published deck's commanders — and
-- saves them as the event's entries and matches. For that:
--
--  * players.endstep: a player's endstep username, set in the admin's
--    Giocatori form or remembered by an import, so the next import finds
--    them again. One player per username (case and outer spaces ignored).
--  * event_entries.archetype may be left empty: endstep doesn't know it —
--    the admin fills it in later. (The admin's form still requires it for
--    a live event.)
--  * replace_event_results(): the event's entries and matches replaced in
--    one transaction (all or nothing), admin only, an open online event
--    only; an archetype or a league bonus already set for a player is kept.
--
-- Rollback: 038_endstep_import_rollback.sql.

alter table players add column if not exists endstep text;
create unique index if not exists players_endstep_unique
  on players (lower(btrim(endstep))) where endstep is not null;

alter table event_entries alter column archetype drop not null;

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
    (m->>'player1_wins')::integer, (m->>'draws')::integer, (m->>'player2_wins')::integer, false
  from jsonb_array_elements(p_matches) m;

  update events set rounds = greatest(coalesce(p_rounds, 1), 1) where id = p_event_id;
end;
$$;

revoke all on function replace_event_results(uuid, integer, jsonb, jsonb) from public, anon;
grant execute on function replace_event_results(uuid, integer, jsonb, jsonb) to authenticated;
