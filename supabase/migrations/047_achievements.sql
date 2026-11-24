-- 047: achievements ("Obiettivi").
--
-- * player_achievements — the ones earned by playing (results): a derived
--   cache like player_progress, computed by js/achievement-progress.js and
--   fully replaced by the admin's sync (admin/js/badges-sync.js). Public
--   read: it only summarises public results.
-- * account_achievements — the three earned on the site (Collegato, Carta
--   creata, Prima decklist): one row per account and achievement, written
--   only by the functions below. No direct access.
-- * achievements_seen — which unlocks an account has already been shown
--   (the "Obiettivo sbloccato" bar, js/achievement-toast.js): once per
--   account, not per device. Each account its own rows.
--
-- Run on dcp-dev first, then live. The site achievements of the existing
-- accounts are filled at the end of this file; player_achievements by the
-- admin's sync, which runs by itself on the admin's next visit (the table
-- empty). Rollback: 047_achievements_rollback.sql.

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

-- Records an account's site achievements whose fact is there (none twice):
-- Collegato (linked to a player) and Prima decklist (one sent — dated by
-- the first). Normally called on each visit (my_achievements, below), so
-- "now" is when it happened, near enough; p_backfill (this migration's own
-- run over the accounts that already exist): the account's creation for
-- Collegato instead (the link itself has no date). Carta creata isn't
-- here: every linked account gets a default card (give_default_card), so a
-- profiles row proves nothing — it's recorded when the owner saves the
-- card (record_card_saved, below). Never called directly.
create or replace function record_site_achievements(p_user_id uuid, p_backfill boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t timestamptz;
begin
  if exists (select 1 from players p where p.user_id = p_user_id) then
    select case when p_backfill then u.created_at else now() end into t from auth.users u where u.id = p_user_id;
    insert into account_achievements (user_id, key, unlocked_at)
    values (p_user_id, 'collegato', coalesce(t, now())) on conflict do nothing;
  end if;
  select min(d.sent_at) into t from decklist_submissions d where d.user_id = p_user_id;
  if t is not null then
    insert into account_achievements (user_id, key, unlocked_at)
    values (p_user_id, 'prima_decklist', t) on conflict do nothing;
  end if;
end $$;

revoke execute on function record_site_achievements(uuid, boolean) from public, anon, authenticated;

-- Carta creata: the card saved by its owner (account.html — any save of the
-- profiles row by the signed-in account itself). The default card given at
-- linking (give_default_card, run by the admin's approval) is written by
-- another account, so it doesn't count.
create or replace function record_card_saved() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id = auth.uid() then
    insert into account_achievements (user_id, key) values (new.user_id, 'carta_creata') on conflict do nothing;
  end if;
  return new;
end $$;

revoke execute on function record_card_saved() from public, anon, authenticated;

create trigger profiles_record_card_saved
  after insert or update on profiles
  for each row execute function record_card_saved();

-- The signed-in account's achievements, in one call (js/achievement-toast.js,
-- account.html's "Obiettivi"): first the site ones whose fact is there now
-- are recorded (record_site_achievements), then returned:
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
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  select p.id into pid from players p where p.user_id = uid;
  perform record_site_achievements(uid);

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

-- The accounts that already exist: their site achievements now, from what's
-- already there (not only once each signs in again — player.html shows them
-- to everyone). Carta creata for the cards changed from a default one (the
-- default: the most played commander's art, no picture, nothing else set),
-- dated by their last save. The ones earned by playing come from the
-- admin's sync, which runs by itself the first time the admin opens with
-- player_achievements empty (admin/js/badges-sync.js).
select record_site_achievements(u.id, true) from auth.users u;

insert into account_achievements (user_id, key, unlocked_at)
select pr.user_id, 'carta_creata', pr.updated_at
from profiles pr
where pr.description is not null
   or pr.fav_colors <> ''
   or pr.fav_card_print is not null
   or pr.fav_commander_id is not null
   or pr.show_avatar
   or not pr.show_on_player_page
   or pr.instagram is not null
   or pr.moxfield is not null
   or pr.archidekt is not null
   or pr.endstep is not null
on conflict do nothing;
