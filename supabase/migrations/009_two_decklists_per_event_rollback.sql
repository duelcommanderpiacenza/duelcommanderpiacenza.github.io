-- Undoes 009_two_decklists_per_event.sql: back to one decklist per player
-- and event. Second sends are forgotten first (the old key can't hold them).
-- Redeploy the previous send-decklist function too.
delete from decklist_submissions where attempt = 2;
alter table decklist_submissions drop constraint decklist_submissions_pkey;
alter table decklist_submissions add primary key (player_id, event_id);
alter table decklist_submissions drop column attempt;
