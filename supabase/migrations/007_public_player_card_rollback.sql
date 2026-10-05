-- Undoes 007_public_player_card.sql: no more cards on the player pages.
drop function if exists public_player_card(uuid);
alter table profiles drop column if exists show_on_player_page;
