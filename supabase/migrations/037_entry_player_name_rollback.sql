-- Rollback of 037_entry_player_name.sql. DELETES every free-form entry
-- (player_name set, no player record) — a player_id must be back on every
-- row before it can be required again.

create or replace view league_player_counts with (security_invoker = true) as
select
  e.league_id,
  count(distinct ee.player_id)::int as players
from event_entries ee
join events e on e.id = ee.event_id
where e.league_id is not null or not e.is_online
group by e.league_id;

drop trigger if exists events_keep_online_with_names on events;
drop function if exists events_keep_online_with_names();
drop trigger if exists event_entries_name_online_only on event_entries;
drop function if exists event_entries_name_online_only();

delete from event_entries where player_id is null;
drop index if exists event_entries_one_per_name;
alter table event_entries drop constraint if exists event_entries_player_or_name;
alter table event_entries drop column if exists player_name;
alter table event_entries alter column player_id set not null;
