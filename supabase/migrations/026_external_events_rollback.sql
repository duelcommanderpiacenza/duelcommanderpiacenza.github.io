-- Undoes 026_external_events.sql. Deletes the external events first (they
-- would otherwise turn into ordinary open standalone events).

delete from events where is_external;

drop policy "events_public_read" on events;
create policy "events_public_read" on events for select
  using (is_open = false or event_date >= current_date or is_admin());

alter table events drop constraint events_external_open;
alter table events drop constraint events_external_standalone;
alter table events drop column location;
alter table events drop column is_external;
