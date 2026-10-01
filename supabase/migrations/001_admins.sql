-- 001 — Admins vs. logged-in users (step 0 of the player login).
--
-- Until now every RLS policy treated "authenticated" (= anyone signed in)
-- as the admin: all writes, plus reading open/unpublished events, entries,
-- matches and standings. That only held because public sign-up is disabled
-- and the admin is the only account. Players will be able to sign in too,
-- so "is the admin" becomes its own check: listed in the admins table,
-- tested by is_admin(). Every policy that said auth.role() = 'authenticated'
-- now says is_admin() — nothing else changes for the admin or the public.
--
-- Run once in the SQL editor, then add the admin account(s) (see the end).
-- Undo: 001_admins_rollback.sql.

create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- RLS on with no policies: nobody reads or writes it through the API, only
-- is_admin() below (security definer) and the SQL editor.
alter table admins enable row level security;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

grant execute on function is_admin() to anon, authenticated;

-- Admin-only writes.
do $$
declare
  t text;
begin
  foreach t in array array['announcements', 'commanders', 'players', 'badges', 'leagues', 'events',
                           'event_entries', 'matches', 'player_badges_auto', 'event_standings']
  loop
    execute format('drop policy "%s_admin_insert" on %I;', t, t);
    execute format('drop policy "%s_admin_update" on %I;', t, t);
    execute format('drop policy "%s_admin_delete" on %I;', t, t);
    execute format('create policy "%s_admin_insert" on %I for insert with check (is_admin());', t, t);
    execute format('create policy "%s_admin_update" on %I for update using (is_admin());', t, t);
    execute format('create policy "%s_admin_delete" on %I for delete using (is_admin());', t, t);
  end loop;
end $$;

-- Reading unpublished data: the admin only.
drop policy "events_public_read" on events;
create policy "events_public_read" on events for select
  using (is_open = false or event_date >= current_date or is_admin());

drop policy "event_entries_public_read" on event_entries;
create policy "event_entries_public_read" on event_entries for select
  using (
    is_admin()
    or exists (select 1 from events e where e.id = event_entries.event_id and e.is_open = false)
  );

drop policy "matches_public_read" on matches;
create policy "matches_public_read" on matches for select
  using (
    is_admin()
    or exists (select 1 from events e where e.id = matches.event_id and e.is_open = false)
  );

drop policy "event_standings_public_read" on event_standings;
create policy "event_standings_public_read" on event_standings for select
  using (
    is_admin()
    or exists (select 1 from events e where e.id = event_standings.event_id and e.is_open = false)
  );

-- Then make your admin account an admin (replace the email):
--   insert into admins (user_id) select id from auth.users where email = 'admin@example.com';
