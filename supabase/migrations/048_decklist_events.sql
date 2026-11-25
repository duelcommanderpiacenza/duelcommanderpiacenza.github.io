-- 048: the events a decklist can be sent for — decklist_events().
--
-- The 2 next events (today's included) and the 2 last ones, by Piacenza's
-- date, open or closed: the only rule (user, 2026-11-25). Before, an
-- upcoming event had to be open and today or later, a past one closed and
-- played — so an event still open after midnight (results not entered yet)
-- was neither, and couldn't be picked until it was closed. Security
-- definer: an open event whose date has passed is hidden by events' RLS.
-- Never an external (played elsewhere) or online (endstep) event. Used by
-- account.html's "Invia la tua decklist" (js/db.js's Decklists.events) and
-- by the send-decklist Edge Function, which accepts only these.
--
-- Run on dcp-dev first, then live; then redeploy send-decklist (it calls
-- this). Rollback: 048_decklist_events_rollback.sql.

create or replace function decklist_events()
returns table (
  id uuid,
  name text,
  event_date date,
  league_name text,
  upcoming boolean
)
language sql stable security definer set search_path = public as $$
  with today as (select (now() at time zone 'Europe/Rome')::date as d),
  pool as (
    select e.* from events e
    where not e.is_external and not e.is_online
  ),
  picked as (
    (select p.*, true as upcoming from pool p, today t
      where p.event_date >= t.d order by p.event_date, p.created_at, p.id limit 2)
    union all
    (select p.*, false as upcoming from pool p, today t
      where p.event_date < t.d order by p.event_date desc, p.created_at desc, p.id limit 2)
  )
  select p.id, p.name, p.event_date, l.name, p.upcoming
  from picked p
  left join leagues l on l.id = p.league_id
  order by p.upcoming desc, case when p.upcoming then p.event_date end, p.event_date desc;
$$;

revoke execute on function decklist_events() from public, anon;
grant execute on function decklist_events() to authenticated, service_role;
