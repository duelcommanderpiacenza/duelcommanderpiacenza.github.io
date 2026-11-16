-- 037 (2026-11-16): free-form players in online events. Safe to run again.
--
-- An online event's entrant may be someone with no player record — just a
-- name typed in the admin (event_entries.player_name, player_id null). Shown
-- only in that event's pages and its online league's standings (matched by
-- name, case and outer spaces ignored, across the league's events); never in
-- Giocatori, the search or a player page. Commander and archetype stay
-- required. Exactly one of player_id / player_name; a free name only in an
-- online event (trigger below), and an event with free names can't stop
-- being online. Rollback: 037_entry_player_name_rollback.sql.

alter table event_entries alter column player_id drop not null;
alter table event_entries add column if not exists player_name text;

alter table event_entries drop constraint if exists event_entries_player_or_name;
alter table event_entries add constraint event_entries_player_or_name check (
  (player_id is null) <> (player_name is null) and (player_name is null or btrim(player_name) <> '')
);

-- One entry per free name per event, like event_entries_one_per_player.
create unique index if not exists event_entries_one_per_name
  on event_entries (event_id, lower(btrim(player_name))) where player_name is not null;

create or replace function event_entries_name_online_only() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.player_name is not null and not coalesce((select is_online from events where id = new.event_id), false) then
    raise exception 'A free-form player (player_name) is only allowed in an online event';
  end if;
  return new;
end;
$$;

drop trigger if exists event_entries_name_online_only on event_entries;
create trigger event_entries_name_online_only
  before insert or update of player_name, event_id on event_entries
  for each row execute function event_entries_name_online_only();

create or replace function events_keep_online_with_names() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.is_online and exists (select 1 from event_entries where event_id = new.id and player_name is not null) then
    raise exception 'This event has free-form players: it must stay online';
  end if;
  return new;
end;
$$;

drop trigger if exists events_keep_online_with_names on events;
create trigger events_keep_online_with_names
  before update of is_online on events
  for each row when (old.is_online and not new.is_online)
  execute function events_keep_online_with_names();

-- A league's distinct players counting the free names too (once per name).
create or replace view league_player_counts with (security_invoker = true) as
select
  e.league_id,
  count(distinct coalesce(ee.player_id::text, 'name:' || lower(btrim(ee.player_name))))::int as players
from event_entries ee
join events e on e.id = ee.event_id
where e.league_id is not null or not e.is_online
group by e.league_id;
