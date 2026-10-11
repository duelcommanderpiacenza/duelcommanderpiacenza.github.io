-- 019 — Settings remembered per account: for now, the site's theme.
--
-- * user_settings: one row per account that changed a setting — `theme`,
--   picked from the footer's theme button (js/theme.js): 'light', 'dark' or
--   'system' (follow the device). Private: each account reads and writes
--   only its own row. A table of its own rather than a profiles column: a
--   profiles row means "this account saved a player card" (public_player_card()
--   shows it), so a theme alone must not create one.
--
-- Numbered 019: 016/017 are the parked decklists migrations, 018 follows leagues.
--
-- Run once in the SQL editor (dev first). Undo: 019_user_settings_rollback.sql.

create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;

create policy "user_settings_read_own" on user_settings for select
  using (user_id = auth.uid());

create policy "user_settings_insert_own" on user_settings for insert
  with check (user_id = auth.uid());

create policy "user_settings_update_own" on user_settings for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
