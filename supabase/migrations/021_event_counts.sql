-- 021 — Leghe & Eventi's numbers without downloading every entry and match
-- ever: two small views the page reads instead (js/events-page.js, with the
-- old full download kept as a fallback until this has run).
--
-- * event_counts: per event, its players (entries — one per player) and its
--   matches (every match row, byes and drops included, like league.html's
--   "Partite giocate").
-- * league_player_counts: per league, its distinct players across all its
--   events; league_id null = the standalone events together.
--
-- security_invoker: the views read with the caller's own rights, so the
-- tables' RLS applies as for a direct query — a visitor counts the closed
-- (published) events only, as before; the admin sees the open ones too.
--
-- Run once in the SQL editor (dev first). Undo: 021_event_counts_rollback.sql.

create view event_counts with (security_invoker = true) as
select
  e.id as event_id,
  (select count(*) from event_entries ee where ee.event_id = e.id)::int as players,
  (select count(*) from matches m where m.event_id = e.id)::int as matches
from events e;

create view league_player_counts with (security_invoker = true) as
select
  e.league_id,
  count(distinct ee.player_id)::int as players
from event_entries ee
join events e on e.id = ee.event_id
group by e.league_id;

grant select on event_counts, league_player_counts to anon, authenticated;
