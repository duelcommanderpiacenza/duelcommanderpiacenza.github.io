-- 004 — Profiles (step 4 of the player login).
--
-- One row per login account (not per player): a user fills it in on
-- account.html ("Profilo") right away, even before the admin approves their
-- player claim, and if the admin moves the player link to another account,
-- the profile stays with the person it belongs to.
--
-- Each user reads and writes only their own row (plain RLS, no functions
-- needed); the admin can read all. Not public yet.
--
-- Run once in the SQL editor (dev first). Undo: 004_profiles_rollback.sql.

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  description text check (char_length(description) <= 500),
  -- Favourite colors as a WUBRG-ordered string ('' = none, 'UB', 'WUBRG'…);
  -- the check allows only that order, each color at most once.
  fav_colors text not null default '' check (fav_colors ~ '^W?U?B?R?G?$'),
  fav_commander_id uuid references commanders(id) on delete set null,
  fav_archetype deck_archetype,
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles_read_own" on profiles for select
  using (user_id = auth.uid() or is_admin());

create policy "profiles_insert_own" on profiles for insert
  with check (user_id = auth.uid());

create policy "profiles_update_own" on profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
