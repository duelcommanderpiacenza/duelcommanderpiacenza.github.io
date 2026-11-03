-- 034 (2026-11-03): online leagues and events (played on endstep.cc,
-- results entered in the admin like the live ones) — ENDSTEP_PLAN.md.
--
-- leagues: is_topdeck renamed no_points (same meaning: no points
-- leaderboard), and a new is_online. The two are independent: a live league,
-- a "Serie Topdeck" (live, no points), an online league (with points), a
-- "Serie online" (no points). One open league of each of the four kinds.
--
-- events.is_online: the one answer to "was this played online" — a league
-- event's is kept equal to its league's by a trigger, a standalone event's
-- is set in the admin. For now online events are shown only on the
-- Bacheca's timeline, Leghe & Eventi (the online leagues), their league's
-- and their own pages: js/db.js leaves them out of everything else.
--
-- is_topdeck stays, for a while, as a read-only copy of no_points: browsers
-- still running the old scripts (service worker, an open tab) keep reading
-- it. A later migration drops it.
-- Rollback: 034_online_leagues_rollback.sql.

alter table leagues rename column is_topdeck to no_points;
alter table leagues add column is_online boolean not null default false;
alter table leagues add column is_topdeck boolean generated always as (no_points) stored;

drop index if exists leagues_only_one_open_idx;
create unique index leagues_only_one_open_idx on leagues (no_points, is_online) where is_open;

alter table events add column is_online boolean not null default false;
alter table events add constraint events_external_not_online check (not (is_external and is_online));

-- A league event's is_online is its league's: set on every insert and
-- league change (whatever the admin sent)...
create or replace function events_online_from_league() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.league_id is not null then
    select is_online into new.is_online from leagues where id = new.league_id;
  end if;
  return new;
end;
$$;

create trigger events_online_from_league
  before insert or update of league_id, is_online on events
  for each row execute function events_online_from_league();

-- ...and passed on to its events when the league's own flag changes.
create or replace function leagues_online_to_events() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update events set is_online = new.is_online where league_id = new.id and is_online <> new.is_online;
  return new;
end;
$$;

create trigger leagues_online_to_events
  after update of is_online on leagues
  for each row when (old.is_online is distinct from new.is_online)
  execute function leagues_online_to_events();

-- Leghe & Eventi's standalone tile counts the live standalone events'
-- players only (the online ones aren't listed there).
create or replace view league_player_counts with (security_invoker = true) as
select
  e.league_id,
  count(distinct ee.player_id)::int as players
from event_entries ee
join events e on e.id = ee.event_id
where e.league_id is not null or not e.is_online
group by e.league_id;
