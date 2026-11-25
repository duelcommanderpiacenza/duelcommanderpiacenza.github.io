-- Rollback of 048_decklist_events.sql. Run it only with the old
-- send-decklist function deployed again (this one calls decklist_events()).

drop function if exists decklist_events();
