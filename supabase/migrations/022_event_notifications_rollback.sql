-- Undoes 022_event_notifications.sql: no more automatic "Risultati online"
-- announcements; the ones already made are deleted (dropping the column
-- alone would leave them as plain announcements until they expire).

drop trigger if exists events_notify_first_close on events;
drop function if exists events_notify_first_close();

drop policy if exists "announcements_public_read" on announcements;
create policy "announcements_public_read" on announcements for select using (true);

delete from announcements where event_id is not null;
alter table announcements drop column if exists event_id;
alter table events drop column if exists first_closed_at;
