-- 011 — Player progress: the numbers behind the player card's cosmetics.
--
-- * player_progress: one row per player with published (closed-event)
--   results — events played, matches won, top 8s in events of 20+ players,
--   distinct commanders (commander + partner pairs, like player.html's
--   album) and the names of the real leagues won. A pure derived cache like
--   event_standings: computed from the results by js/card-progress.js and
--   fully replaced by admin/js/badges-sync.js on every event / league /
--   badge change (the first run after this migration fills it). Read by
--   js/card-cosmetics.js to dress the player card (account.html, and
--   player.html when the card is shown there). Public read: it only
--   summarises results that are public already.
--
-- Run once in the SQL editor (dev first). Undo: 011_player_progress_rollback.sql.

create table player_progress (
  player_id uuid primary key references players(id) on delete cascade,
  events_played integer not null default 0,
  matches_won integer not null default 0,
  big_top8s integer not null default 0,   -- top 8s in events with 20+ players
  commanders integer not null default 0,  -- distinct commander + partner pairs
  leagues_won text[] not null default '{}' -- names of the real leagues won
);

alter table player_progress enable row level security;
create policy "player_progress_admin_insert" on player_progress for insert with check (is_admin());
create policy "player_progress_admin_update" on player_progress for update using (is_admin());
create policy "player_progress_admin_delete" on player_progress for delete using (is_admin());
create policy "player_progress_public_read" on player_progress for select using (true);
