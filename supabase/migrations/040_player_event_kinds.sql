-- 040 (2026-11-16): which kinds of event each player has played. Safe to
-- run again.
--
-- A player who has played online events only (on endstep — created by
-- "Importa da endstep", migration 038) has an empty player page, which
-- counts live events only: such a player is never a link and isn't offered
-- by the site search (user, 2026-11-16). This view tells them apart without
-- downloading every entry: per player, whether they have a live entry and
-- an online one. security_invoker: the tables' RLS applies (visitors: closed
-- events only). Rollback: 040_player_event_kinds_rollback.sql.

create or replace view player_event_kinds with (security_invoker = true) as
select
  x.player_id,
  bool_or(not e.is_online) as live,
  bool_or(e.is_online) as online
from event_entries x
join events e on e.id = x.event_id
group by x.player_id;

grant select on player_event_kinds to anon, authenticated;
