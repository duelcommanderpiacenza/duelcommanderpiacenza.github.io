-- Rollback of 029_drop_follows.sql: the follows table back as it was
-- (migrations 010 and 018), empty — the dropped rows can't come back.

create table follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  commander_id uuid references commanders(id) on delete cascade,
  league_id uuid references leagues(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Exactly one of the three.
  constraint follows_one_target check (num_nonnulls(player_id, commander_id, league_id) = 1),
  unique (user_id, player_id),
  unique (user_id, commander_id),
  constraint follows_league_unique unique (user_id, league_id)
);

alter table follows enable row level security;

create policy "follows_read_own" on follows for select
  using (user_id = auth.uid());

-- Not one's own player (the one linked to the account).
create policy "follows_insert_own" on follows for insert
  with check (
    user_id = auth.uid()
    and not exists (select 1 from players p where p.id = follows.player_id and p.user_id = auth.uid())
  );

create policy "follows_delete_own" on follows for delete
  using (user_id = auth.uid());
