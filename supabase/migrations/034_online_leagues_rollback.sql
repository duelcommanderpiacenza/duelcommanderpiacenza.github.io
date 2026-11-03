-- Rollback of 034_online_leagues.sql: no_points back to is_topdeck, the
-- online flags dropped (with their values: an online league becomes a live
-- one). Fails while two open leagues differ only in is_online (one live, one
-- online of the same no_points): close one first.

create or replace view league_player_counts with (security_invoker = true) as
select
  e.league_id,
  count(distinct ee.player_id)::int as players
from event_entries ee
join events e on e.id = ee.event_id
group by e.league_id;

drop trigger if exists leagues_online_to_events on leagues;
drop function if exists leagues_online_to_events();
drop trigger if exists events_online_from_league on events;
drop function if exists events_online_from_league();

alter table events drop constraint if exists events_external_not_online;
alter table events drop column if exists is_online;

drop index if exists leagues_only_one_open_idx;
alter table leagues drop column if exists is_topdeck;
alter table leagues drop column if exists is_online;
alter table leagues rename column no_points to is_topdeck;
create unique index leagues_only_one_open_idx on leagues (is_topdeck) where is_open;
