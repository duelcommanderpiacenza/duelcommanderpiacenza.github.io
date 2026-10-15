-- 022 — A "Novità" (the header's bell, js/header-news.js) of its own for
-- every event the first time it's closed: "Risultati online: <event>".
--
-- * Only the first close: events.first_closed_at is stamped then, so
--   reopening and closing it again never makes a second one — not even once
--   the first is gone (5 days later, below).
-- * Shown only while its event is closed (announcements_public_read): reopening
--   the event hides it, closing it again shows the same one back (the same
--   id, so a visitor who'd read it doesn't see it as new again).
-- * Gone after 5 days: expires_on is the closing day + 4 — shown that day and
--   the 4 after (js/db.js Announcements.listActive), then deleted from the
--   table by the nightly 'delete-expired-announcements' cron job (schema.sql),
--   already there for the admin's own announcements.
-- * Made by a trigger, so every way the admin closes an event (a league's,
--   a standalone one, the event page's own toggle) does it.
--
-- Events already closed when this runs count as notified (no announcement
-- for them). Run once in the SQL editor (dev first). Undo:
-- 022_event_notifications_rollback.sql.

alter table events add column first_closed_at timestamptz;
update events set first_closed_at = now() where not is_open;

alter table announcements add column event_id uuid unique references events(id) on delete cascade;

-- Security definer: the insert into announcements works whoever updates the
-- event (the admin's own insert rights aren't needed).
create or replace function events_notify_first_close() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  label text;
  league_name text;
begin
  if old.is_open and not new.is_open and new.first_closed_at is null then
    new.first_closed_at := now();
    select name into league_name from leagues where id = new.league_id;
    -- A Topdeck event can have no name: its date instead, as on the site.
    label := coalesce(nullif(trim(new.name), ''), to_char(new.event_date, 'DD/MM/YYYY'), 'Evento');
    insert into announcements (title, body, event_id, expires_on)
    values (
      'Risultati online: ' || label,
      concat_ws(' · ', league_name, to_char(new.event_date, 'DD/MM/YYYY')),
      new.id,
      current_date + 4
    )
    on conflict (event_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger events_notify_first_close
  before update of is_open on events
  for each row execute function events_notify_first_close();

-- An event's announcement only while the event is closed (the subquery reads
-- events with the visitor's own rights: anyone can see a closed one).
drop policy "announcements_public_read" on announcements;
create policy "announcements_public_read" on announcements for select
  using (
    event_id is null
    or exists (select 1 from events e where e.id = announcements.event_id and not e.is_open)
  );
