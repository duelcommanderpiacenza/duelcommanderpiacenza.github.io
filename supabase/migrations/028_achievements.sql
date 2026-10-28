-- 028: achievements ("Obiettivi").
--
-- * player_achievements — the ones earned by playing (results): a derived
--   cache like player_progress, computed by js/achievement-progress.js and
--   fully replaced by the admin's sync (admin/js/badges-sync.js). Public
--   read: it only summarises public results.
-- * account_achievements — the three earned on the site (Collegato, Carta
--   creata, Prima decklist): one row per account, written only by
--   my_achievements() below once the fact is there. No direct access.
-- * achievements_seen — which unlocks an account has already been shown
--   (the "Obiettivo sbloccato" bar, js/achievement-toast.js): once per
--   account, not per device. Each account its own rows.
--
-- Run on dcp-dev first, then live; then one admin sync fills
-- player_achievements. Rollback: 028_achievements_rollback.sql.

create table player_achievements (
  player_id uuid not null references players(id) on delete cascade,
  key text not null,
  -- The level reached (1 for a single achievement).
  level smallint not null check (level >= 1),
  -- The count behind a tiered one (events, wins…), for the progress
  -- toward the next level; null for a single one.
  value integer,
  -- The date of the event where that level was reached.
  unlocked_at date not null,
  primary key (player_id, key)
);

alter table player_achievements enable row level security;
create policy "player_achievements_admin_insert" on player_achievements for insert with check (is_admin());
create policy "player_achievements_admin_update" on player_achievements for update using (is_admin());
create policy "player_achievements_admin_delete" on player_achievements for delete using (is_admin());
create policy "player_achievements_public_read" on player_achievements for select using (true);

create table account_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key in ('collegato', 'carta_creata', 'prima_decklist')),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- No policies: only the functions below (security definer) touch it.
alter table account_achievements enable row level security;

create table achievements_seen (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  level smallint not null default 1,
  seen_at timestamptz not null default now(),
  primary key (user_id, key, level)
);

alter table achievements_seen enable row level security;
create policy "achievements_seen_read_own" on achievements_seen for select using (user_id = auth.uid());
create policy "achievements_seen_insert_own" on achievements_seen for insert with check (user_id = auth.uid());

-- The signed-in account's achievements, in one call (js/achievement-toast.js,
-- account.html's "Obiettivi"): first the site ones whose fact is there now
-- are recorded (dated by the fact when it has a date — the first decklist
-- sent — else now), then returned:
--   kind 'player' — the linked player's player_achievements rows;
--   kind 'site'   — the account's site ones (level 1);
--   kind 'seen'   — every (key, level) already shown to this account.
create or replace function my_achievements()
returns table (kind text, key text, level smallint, value integer, unlocked_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  pid uuid;
  t timestamptz;
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  select p.id into pid from players p where p.user_id = uid;

  if pid is not null then
    insert into account_achievements (user_id, key) values (uid, 'collegato') on conflict do nothing;
  end if;
  if exists (select 1 from profiles pr where pr.user_id = uid) then
    insert into account_achievements (user_id, key) values (uid, 'carta_creata') on conflict do nothing;
  end if;
  select min(d.sent_at) into t from decklist_submissions d where d.user_id = uid;
  if t is not null then
    insert into account_achievements (user_id, key, unlocked_at) values (uid, 'prima_decklist', t) on conflict do nothing;
  end if;

  return query
    select 'player'::text, pa.key, pa.level, pa.value, pa.unlocked_at::timestamptz
    from player_achievements pa where pid is not null and pa.player_id = pid
    union all
    select 'site'::text, a.key, 1::smallint, null::integer, a.unlocked_at
    from account_achievements a where a.user_id = uid
    union all
    select 'seen'::text, s.key, s.level, null::integer, s.seen_at
    from achievements_seen s where s.user_id = uid;
end $$;

revoke execute on function my_achievements() from public, anon;
grant execute on function my_achievements() to authenticated;

-- The site achievements of the account linked to a player (player.html's
-- "Obiettivi"): key and date only. Nothing for an unlinked player or a
-- blocked account.
create or replace function site_achievements_of(p_player_id uuid)
returns table (key text, unlocked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.key, a.unlocked_at
  from players p
  join account_achievements a on a.user_id = p.user_id
  join auth.users u on u.id = p.user_id
  where p.id = p_player_id
    and not coalesce(u.banned_until > now(), false);
$$;

grant execute on function site_achievements_of(uuid) to anon, authenticated;
