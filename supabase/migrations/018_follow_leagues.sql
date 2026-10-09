-- 018 — Following leagues too.
--
-- * follows.league_id: an account can now follow a league as well (the ★
--   on league.html's hero; account.html's "Seguiti", in a "Leghe" group).
--   Still exactly one target per row — the old two-way check replaced by
--   one over the three columns — and each league followed at most once.
--   Policies unchanged (private, each account its own rows).
--
-- Numbered 018: 016/017 are the parked decklists migrations.
--
-- Run once in the SQL editor (dev first). Undo: 018_follow_leagues_rollback.sql.

alter table follows
  add column league_id uuid references leagues(id) on delete cascade,
  add constraint follows_league_unique unique (user_id, league_id);

-- The old check (unnamed in 010, so found by what it covers) out, the
-- three-way one in.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'follows'::regclass and contype = 'c'
  loop
    execute format('alter table follows drop constraint %I', c.conname);
  end loop;
end $$;

alter table follows
  add constraint follows_one_target check (num_nonnulls(player_id, commander_id, league_id) = 1);
