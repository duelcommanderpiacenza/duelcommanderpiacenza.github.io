-- Undoes 021_event_counts.sql: the two views gone (js/events-page.js falls
-- back to downloading the entries and matches itself).

drop view if exists league_player_counts;
drop view if exists event_counts;
