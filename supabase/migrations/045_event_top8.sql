-- 045 (2026-11-22): an event's top 8 — quarterfinals, semifinals and final
-- after the Swiss rounds, between the Swiss top 8 — and its split win.
-- Safe to run again.
--
-- top8_after: how many Swiss rounds come before the top 8 (null = no top 8);
-- the rounds after them are its stages (js/leaderboard.js top8Stage). Set
-- by the admin's "+ Top 8" tab. top8_split: the players still in split the
-- win — no more rounds, the standings stay as they stood ("Dividi
-- vittoria"). The import from endstep replaces an event's rounds, so it
-- takes the top 8 out too.
-- Rollback: 045_event_top8_rollback.sql.

alter table events add column if not exists top8_after integer;
alter table events add column if not exists top8_split boolean not null default false;

alter table events drop constraint if exists events_top8_after_valid;
alter table events add constraint events_top8_after_valid check (top8_after is null or (top8_after >= 1 and top8_after < rounds));
alter table events drop constraint if exists events_top8_split_needs_top8;
alter table events add constraint events_top8_split_needs_top8 check (not top8_split or top8_after is not null);

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

  update events set rounds = greatest(coalesce(p_rounds, 1), 1), top8_after = null, top8_split = false
  where id = p_event_id;
end;
$$;

revoke all on function replace_event_results(uuid, integer, jsonb, jsonb) from public, anon;
grant execute on function replace_event_results(uuid, integer, jsonb, jsonb) to authenticated;
