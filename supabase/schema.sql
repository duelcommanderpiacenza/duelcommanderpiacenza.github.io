-- Duel Commander Piacenza — events & leagues tracker
-- Run this in the Supabase SQL editor for your project.
-- This file is checked into the repo as documentation of the DB schema;
-- it is NOT auto-deployed by anything.
--
-- This version replaces the earlier schema: the standalone "decks" catalog
-- is gone (a deck is now just "player + commander + archetype" recorded
-- directly on the entry, with an optional partner/background commander), an
-- event may belong to a league or stand alone (league_id nullable), an
-- event's name only needs to be unique within its own league (or among
-- standalone events), a match now records a best-of-3 game score
-- (player1_wins/draws/player2_wins) instead of a single win/loss/draw result
-- and can be a bye (player2_id null, an automatic win for player1) or a drop
-- (player2_id null, is_drop true — the player left the event, excluded from
-- every calculation instead of scored as a win), a league
-- row can be flagged as a "Topdeck" series (is_topdeck) — the same shape,
-- just without a points leaderboard; at most one league and, separately, at
-- most one Topdeck can be open at a time (one of each together is fine),
-- and an entry can carry a manual_rank tiebreak override for its event's
-- standings.
-- Re-running this drops and recreates every table, so it wipes existing
-- rows — expected while there's only test data.

create extension if not exists pgcrypto;

drop table if exists player_progress cascade;
drop table if exists announcements cascade;
drop table if exists matches cascade;
drop table if exists event_entries cascade;
drop table if exists decks cascade;
drop table if exists events cascade;
drop table if exists leagues cascade;
drop table if exists player_claims cascade;
drop table if exists players cascade;
drop table if exists badges cascade;
drop table if exists profiles cascade;
drop table if exists commanders cascade;
drop table if exists admins cascade;
drop type if exists deck_archetype;
drop type if exists match_result;

create type deck_archetype as enum ('aggro', 'control', 'combo', 'tempo', 'midrange');

-- Who the admin is: signed in AND listed here. Being signed in alone isn't
-- enough, since players can sign up too — every admin-only policy below
-- checks is_admin(). RLS on with no policies: nobody reads or writes it
-- through the API, only is_admin() (security definer) and the SQL editor.
-- Added by supabase/migrations/001_admins.sql. After a fresh setup, add the
-- admin account(s):
--   insert into admins (user_id) select id from auth.users where email = 'admin@example.com';
create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table admins enable row level security;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

grant execute on function is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table announcements ( -- short club announcements shown on the Bacheca homepage; the section
    -- there is hidden entirely whenever this table is empty
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  expires_on date -- optional: shown on the Bacheca up to and including this day, hidden afterwards
    -- (null = never expires). Added after the initial schema; on an existing DB run just:
    -- alter table announcements add column expires_on date;
);

create table commanders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color_identity text not null default '', -- subset of the letters W U B R G, e.g. "BR"
  is_banned boolean not null default false, -- shows a warning icon next to the commander on the public site
  created_at timestamptz not null default now()
);

create table badges ( -- small icon + name a player can be tagged with (e.g. "Campione", trophy icon)
  id uuid primary key default gen_random_uuid(),
  name text not null unique, -- shown as the tooltip when hovering the icon next to a player's name
  -- Optional hover text of the badge icon next to player names (js/ui.js's badgeTooltipAttrs);
  -- when empty, the name is shown instead. Not used by badges.html, whose cards show the name
  -- plus a text generated from auto_rule. Added after the initial schema; on an existing DB:
  -- alter table badges add column description text;
  description text,
  -- Exactly one of these two is set: icon is a fixed emoji from the admin's
  -- pool, icon_url is a custom PNG/JPG/WEBP the admin uploaded to the
  -- "badge-icons" Supabase Storage bucket (see js/db.js's BadgeIcons and
  -- admin/js/badges-admin.js). The rendering side (js/players-page.js) just
  -- checks which one is present.
  icon text,
  icon_url text,
  -- Auto-assignment: null means this badge is manual-only (assignable via
  -- the two fixed dropdowns on the players form). A non-null rule instead
  -- computes who currently holds this badge from match/league data
  -- (js/auto-badges.js) — not live on every view, though: recomputed and
  -- cached into player_badges_auto (below) only when an event/league
  -- closes (admin/js/badges-sync.js), which is the only time the
  -- underlying data actually changes. Add new rule strings to the check
  -- constraint below as more are defined.
  auto_rule text,
  -- Higher wins when a player would qualify for more auto badges than
  -- there are slots (2). Manually assigned badges (badge1/badge2 on
  -- players) always display before any auto badge, regardless of this.
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  constraint badges_icon_present check (icon is not null or icon_url is not null),
  -- The last four rules were added after the initial schema; on an existing DB, replace the
  -- constraint (drop + add) with this same list rather than re-running this file.
  constraint badges_auto_rule_valid check (
    auto_rule is null or auto_rule in (
      'league_winner', 'top8_streak', 'league_rank_1', 'league_rank_2', 'league_rank_3',
      'highest_winrate', 'most_matches_played', 'most_commanders_played', 'completionist',
      'league_champion', 'most_byes', 'most_drops', 'commander_loyalty'
    )
  )
);

create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null,      -- duplicates allowed (homonyms)
  handle text,              -- optional disambiguator shown next to the name when it collides
  -- Up to 2 *manually* assigned badges, each its own nullable slot (not a
  -- join table) since the admin UI is literally two fixed dropdowns. A
  -- player can show up to 2 more on top of these, from badges.auto_rule —
  -- see player_badges_auto below, not stored on this row.
  badge1_id uuid,
  badge2_id uuid,
  -- The login account linked to this player (player_claims below): at most
  -- one each way. Written only by the admin (players_admin_update).
  user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint players_badge1_id_fkey foreign key (badge1_id) references badges(id) on delete set null,
  constraint players_badge2_id_fkey foreign key (badge2_id) references badges(id) on delete set null,
  constraint players_badges_distinct check (badge1_id <> badge2_id)
);

create table leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_open boolean not null default true, -- true while ongoing; the "current" league shown on the homepage
  is_topdeck boolean not null default false, -- a "Topdeck" series: same shape as a league (a bucket of
    -- events), listed alongside leagues, but has no points leaderboard and never powers the homepage
  created_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  name text, -- optional for a Topdeck event: left blank, the public site shows the date as its title instead
  event_date date,
  start_time time, -- optional; shown alongside the date wherever it's displayed if set — also what lets a
    -- future event surface on the public Bacheca's "Prossimi eventi" card before it's actually been played
    -- (see events_public_read below)
  league_id uuid references leagues(id) on delete cascade, -- null = standalone event, not part of any league
  rounds integer not null default 1, -- number of turns/rounds, set manually by the admin
  is_open boolean not null default true, -- while open, the event's data is admin-only; closing it publishes it
  results_url text, -- optional link to the event's top decks on mtgtop8, shown as a small red "Top 8" pill next to
    -- the event name on the public site; editable any time, closed events included. http(s) only — it's
    -- rendered as a public link, so a javascript: URL must never get in.
    -- Added after the initial schema; on an existing DB (don't re-run this file, it wipes everything):
    --   alter table events add column results_url text
    --     constraint events_results_url_http check (results_url ~* '^https?://');
  decklists_url text, -- optional link to the event's decklists on Moxfield, shown as the white Moxfield-logo half
    -- of that same pill (or alone, as a round logo button, with no results_url). Same rules as results_url.
    -- Added after the initial schema; on an existing DB:
    --   alter table events add column decklists_url text
    --     constraint events_decklists_url_http check (decklists_url ~* '^https?://');
  created_at timestamptz not null default now(),
  constraint events_unique_name_per_league unique (league_id, name), -- same name OK across leagues, not within one
  constraint events_results_url_http check (results_url ~* '^https?://'),
  constraint events_decklists_url_http check (decklists_url ~* '^https?://')
);

-- Postgres treats every NULL as distinct for a plain unique constraint, so
-- events_unique_name_per_league above doesn't actually stop two standalone
-- (league_id is null) events from sharing a name — this partial index covers
-- that case specifically.
create unique index events_unique_standalone_name on events (name) where league_id is null;

create table event_entries ( -- a player's commander(s) + archetype for one event
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  commander_id uuid not null,
  partner_commander_id uuid, -- optional partner/background commander; entry reads as "Commander / Partner"
  archetype deck_archetype not null,
  bonus_points integer not null default 0, -- manual one-off league-point adjustment (e.g. a special-tournament bonus)
  manual_rank integer, -- admin override for this player's place within their tied-on-points group in the
    -- event standings (lower = better); null everywhere the computed MTG tiebreakers are left as-is
  created_at timestamptz not null default now(),
  constraint event_entries_commander_id_fkey foreign key (commander_id) references commanders(id) on delete restrict,
  constraint event_entries_partner_commander_id_fkey foreign key (partner_commander_id) references commanders(id) on delete restrict,
  constraint event_entries_partner_distinct check (partner_commander_id is null or partner_commander_id <> commander_id),
  constraint event_entries_one_per_player unique (event_id, player_id)
);

create table player_badges_auto ( -- precomputed badges.auto_rule assignments — see admin/js/badges-sync.js.
    -- Recomputed and fully replaced (delete-all then reinsert) whenever an
    -- event or league is closed in the admin, rather than live-computed on
    -- every page view (js/auto-badges.js's own computation is expensive:
    -- several rules independently re-fetch overlapping match/event data).
    -- No id/created_at — this is pure derived cache, not a record of anything.
  player_id uuid not null references players(id) on delete cascade,
  badge_id uuid not null references badges(id) on delete cascade,
  primary key (player_id, badge_id)
);

create table matches ( -- one round pairing between two players, scored as a best-of-3 game count
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  round integer not null default 1,
  player1_id uuid not null,
  player2_id uuid, -- null = a bye (is_drop false) or a drop (is_drop true) — player1 has no opponent this round
  player1_wins integer not null default 0,
  draws integer not null default 0,
  player2_wins integer not null default 0,
  -- player1 left the event as of this round: not a win, loss, or game played,
  -- excluded from every leaderboard/winrate calculation — kept only as a
  -- record so the round history shows it and the admin form stops offering
  -- that player in later rounds of the same event. Mutually exclusive with a
  -- bye (player2_id null with is_drop false).
  is_drop boolean not null default false,
  created_at timestamptz not null default now(),
  constraint matches_player1_id_fkey foreign key (player1_id) references players(id) on delete restrict,
  constraint matches_player2_id_fkey foreign key (player2_id) references players(id) on delete restrict,
  constraint matches_players_distinct check (player1_id <> player2_id),
  -- 0-0-0 is valid (no games played, e.g. an intentional draw) and scores
  -- as a draw. Loosened from "between 1 and 3" after the initial schema; on
  -- an existing DB (don't re-run this file, it wipes everything):
  --   alter table matches drop constraint matches_score_valid;
  --   alter table matches add constraint matches_score_valid check (
  --     player1_wins >= 0 and draws >= 0 and player2_wins >= 0
  --     and (player1_wins + draws + player2_wins) <= 3);
  constraint matches_score_valid check (
    player1_wins >= 0 and draws >= 0 and player2_wins >= 0
    and (player1_wins + draws + player2_wins) <= 3
  )
);

-- At most one *league* and, separately, at most one *Topdeck* series can be
-- open at a time — a normal league and a Topdeck may be open together, but
-- never two of the same kind. A partial unique index on is_topdeck, scoped
-- to the open rows, gives exactly that: among rows where is_open is true,
-- is_topdeck (only two possible values) must be unique, so at most one
-- open row has is_topdeck = false and at most one has it = true. The app
-- closes whatever else is open *of that same kind* before opening one, but
-- this is the actual guarantee.
create unique index leagues_only_one_open_idx on leagues (is_topdeck) where is_open;

create index events_league_id_idx on events (league_id);
create index event_entries_event_id_idx on event_entries (event_id);
create index event_entries_commander_id_idx on event_entries (commander_id);
create index event_entries_partner_commander_id_idx on event_entries (partner_commander_id);
create index matches_event_id_idx on matches (event_id);

-- Deletion rules for published data. Players and commanders are already
-- undeletable while any entry/match references them (the ON DELETE RESTRICT
-- foreign keys above), closed events included. A league, though, would
-- cascade its events away with it (events.league_id ON DELETE CASCADE) —
-- silently wiping published results — so deleting one is refused while it
-- has any closed event; its open (unpublished) events still cascade as
-- before. The admin also checks this up front for a clearer message
-- (admin/js/leagues-admin.js). Added after the initial schema; on an
-- existing DB, run just this function + trigger (don't re-run this file,
-- it wipes everything).
create or replace function leagues_block_delete_with_closed_events() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from events where league_id = old.id and not is_open) then
    raise exception 'La lega ha eventi chiusi e non può essere eliminata.';
  end if;
  return old;
end;
$$;

create trigger leagues_block_delete_with_closed_events
  before delete on leagues
  for each row execute function leagues_block_delete_with_closed_events();

-- A league's total event count, open and closed alike — the X in the league
-- score's best-(X−1)-results rule (js/leaderboard.js's computeLeaguePoints).
-- events_public_read below hides an open event from anonymous visitors once
-- its date has passed (played, not yet closed), so counting visible rows on
-- the public site would come up short; security definer lets this count
-- every row while exposing nothing but the number itself. Added after the
-- initial schema; on an existing DB, run just this function + grant (don't
-- re-run this file, it wipes everything).
create or replace function league_event_count(p_league_id uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from events where league_id = p_league_id;
$$;

grant execute on function league_event_count(uuid) to anon, authenticated;

-- Cached final standings of every closed event, one row per player per
-- event — a pure derived cache like player_badges_auto: recomputed from the
-- matches (js/leaderboard.js's computeEventLeaderboard, same tiebreakers as
-- event.html) and fully replaced by admin/js/badges-sync.js on every
-- event/league/badge change. Lets player.html show a player's position in
-- each event from their own few rows instead of downloading every attended
-- event's full entries + matches. Added after the initial schema; on an
-- existing DB, run just this block (don't re-run this file, it wipes
-- everything). Public read gated to closed events, same as event_entries.
create table event_standings (
  event_id uuid not null references events(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  position integer not null, -- 1 = winner
  points integer not null,   -- match points: 3 win / 1 draw / 0 loss
  wins integer not null,
  draws integer not null,
  losses integer not null,
  primary key (event_id, player_id)
);

create index event_standings_player_idx on event_standings (player_id);

alter table event_standings enable row level security;
create policy "event_standings_admin_insert" on event_standings for insert with check (is_admin());
create policy "event_standings_admin_update" on event_standings for update using (is_admin());
create policy "event_standings_admin_delete" on event_standings for delete using (is_admin());
create policy "event_standings_public_read" on event_standings for select
  using (
    is_admin()
    or exists (select 1 from events e where e.id = event_standings.event_id and e.is_open = false)
  );

-- Player progress, the numbers behind the player card's cosmetics (events
-- played, matches won, top 8s in events of 20+ players, distinct commander
-- pairs, names of the real leagues won) — a pure derived cache like
-- event_standings: computed by js/card-progress.js and fully replaced by
-- admin/js/badges-sync.js on every event/league/badge change. Public read
-- (it only summarises public results). supabase/migrations/011_player_progress.sql.
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

-- Nightly cleanup of expired announcements (pg_cron): deletes every row
-- whose expires_on is before today, at 03:15 UTC — the night after its last
-- day, by which time the Bacheca has already stopped showing it (js/db.js's
-- Announcements.listActive hides it from local midnight). Added after the
-- initial schema, already scheduled on the live DB; to stop it:
-- select cron.unschedule('delete-expired-announcements');
create extension if not exists pg_cron;

select cron.schedule(
  'delete-expired-announcements',
  '15 3 * * *',
  $$delete from announcements where expires_on < current_date$$
);

-- ---------------------------------------------------------------------------
-- Row Level Security: public read (with the open/closed publishing rule
-- below), admin-only write. "Admin" = is_admin() (listed in the admins
-- table above), not just signed in: players can sign up and sign in too,
-- and get no write access from that alone.
--
-- Publishing rule: a league is visible whether it's open or closed (an
-- ongoing league still shows on the public site). An *event*'s data
-- (its entries and matches) is only visible to everyone else once the
-- event itself is closed — admins always see everything, open or closed,
-- so they can keep editing it before publishing.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['announcements', 'commanders', 'players', 'badges', 'leagues', 'events', 'event_entries', 'matches', 'player_badges_auto']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('create policy "%I_admin_insert" on %I for insert with check (is_admin());', t, t);
    execute format('create policy "%I_admin_update" on %I for update using (is_admin());', t, t);
    execute format('create policy "%I_admin_delete" on %I for delete using (is_admin());', t, t);
  end loop;
end $$;

create policy "announcements_public_read" on announcements for select using (true);
create policy "commanders_public_read" on commanders for select using (true);
create policy "players_public_read" on players for select using (true);
create policy "badges_public_read" on badges for select using (true);
create policy "leagues_public_read" on leagues for select using (true);

-- A closed event is fully published as usual; an open one is also readable
-- once its own date is today or later, so it can surface as a bare
-- date/time/name "save the date" preview on the public Bacheca before it's
-- actually been played — event_entries/matches stay gated to is_open =
-- false regardless (see below), so no results ever leak early this way.
create policy "events_public_read" on events for select
  using (is_open = false or event_date >= current_date or is_admin());

create policy "event_entries_public_read" on event_entries for select
  using (
    is_admin()
    or exists (select 1 from events e where e.id = event_entries.event_id and e.is_open = false)
  );

create policy "matches_public_read" on matches for select
  using (
    is_admin()
    or exists (select 1 from events e where e.id = matches.event_id and e.is_open = false)
  );

create policy "player_badges_auto_public_read" on player_badges_auto for select using (true);

-- ---------------------------------------------------------------------------
-- Player login: an account asks to be linked to a player (players.user_id),
-- the admin approves or rejects. Pending requests live here — at most one
-- per account and one per player. Users read only their own and write only
-- through the two functions below, which check every rule first. Added by
-- supabase/migrations/002_player_claims.sql.
-- ---------------------------------------------------------------------------

create table player_claims (
  user_id uuid primary key references auth.users(id) on delete cascade,
  player_id uuid not null unique references players(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table player_claims enable row level security;

create policy "player_claims_read_own" on player_claims for select
  using (user_id = auth.uid() or is_admin());

create policy "player_claims_admin_delete" on player_claims for delete
  using (is_admin());

-- Errors are codes js/account-page.js translates: not_signed_in,
-- already_linked, request_pending, player_not_found, player_taken,
-- player_requested.
create or replace function request_player_claim(p_player_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  if exists (select 1 from players where user_id = uid) then
    raise exception 'already_linked';
  end if;
  if exists (select 1 from player_claims where user_id = uid) then
    raise exception 'request_pending';
  end if;
  if not exists (select 1 from players where id = p_player_id) then
    raise exception 'player_not_found';
  end if;
  if exists (select 1 from players where id = p_player_id and user_id is not null) then
    raise exception 'player_taken';
  end if;
  if exists (select 1 from player_claims where player_id = p_player_id) then
    raise exception 'player_requested';
  end if;
  insert into player_claims (user_id, player_id) values (uid, p_player_id);
exception
  when unique_violation then
    raise exception 'player_requested';
end $$;

create or replace function cancel_player_claim() returns void
language sql security definer set search_path = public as $$
  delete from player_claims where user_id = auth.uid();
$$;

revoke execute on function request_player_claim(uuid) from public, anon;
revoke execute on function cancel_player_claim() from public, anon;
grant execute on function request_player_claim(uuid) to authenticated;
grant execute on function cancel_player_claim() to authenticated;

-- ---------------------------------------------------------------------------
-- Player login: the admin's user management (admin "Utenti" tab). Login
-- accounts live in auth.users, out of the API's reach, so it's all these
-- admin-only functions — each checks is_admin() first and raises not_admin
-- otherwise. Errors are codes admin/js/users-admin.js translates. Added by
-- supabase/migrations/003_admin_users.sql.
-- ---------------------------------------------------------------------------

-- Every account: sign-in method(s), dates, admin/blocked, linked player,
-- pending request. Newest accounts first.
create or replace function admin_list_users()
returns table (
  user_id uuid,
  email text,
  providers text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  is_admin boolean,
  is_blocked boolean,
  player_id uuid,
  player_name text,
  player_handle text,
  claim_player_id uuid,
  claim_player_name text,
  claim_player_handle text,
  claim_created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
-- (The output columns above share names with table columns — user_id,
-- created_at, … — inside the query, a bare name means the table's column.)
begin
  if not is_admin() then
    raise exception 'not_admin';
  end if;
  return query
    select
      u.id,
      u.email::text,
      coalesce((select string_agg(p, ', ') from jsonb_array_elements_text(u.raw_app_meta_data -> 'providers') p), ''),
      u.created_at,
      u.last_sign_in_at,
      exists (select 1 from admins a where a.user_id = u.id),
      coalesce(u.banned_until > now(), false),
      lp.id,
      lp.name,
      lp.handle,
      cp.id,
      cp.name,
      cp.handle,
      c.created_at
    from auth.users u
    left join players lp on lp.user_id = u.id
    left join player_claims c on c.user_id = u.id
    left join players cp on cp.id = c.player_id
    order by u.created_at desc;
end $$;

-- Approves an account's pending request: links it to the requested player,
-- removing that player's link to any other account and this account's link
-- to any other player (one each way).
create or replace function admin_approve_claim(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_player_id uuid;
begin
  if not is_admin() then
    raise exception 'not_admin';
  end if;
  select player_id into v_player_id from player_claims where user_id = p_user_id;
  if v_player_id is null then
    raise exception 'claim_not_found';
  end if;
  delete from player_claims where user_id = p_user_id;
  update players set user_id = null where user_id = p_user_id or id = v_player_id;
  update players set user_id = p_user_id where id = v_player_id;
end $$;

create or replace function admin_reject_claim(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'not_admin';
  end if;
  delete from player_claims where user_id = p_user_id;
end $$;

-- Links an account to a player directly (p_player_id), or unlinks it
-- (p_player_id null). Moving a player away from another account is allowed:
-- the admin can change any link at any time. Any pending request of this
-- account, or for this player, is dropped — it's been decided.
create or replace function admin_set_user_player(p_user_id uuid, p_player_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'not_admin';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user_not_found';
  end if;
  if p_player_id is not null and not exists (select 1 from players where id = p_player_id) then
    raise exception 'player_not_found';
  end if;
  delete from player_claims where user_id = p_user_id or player_id = p_player_id;
  update players set user_id = null where user_id = p_user_id or id = p_player_id;
  if p_player_id is not null then
    update players set user_id = p_user_id where id = p_player_id;
  end if;
end $$;

-- Blocks (or unblocks) an account. Blocked = Supabase Auth's own ban date,
-- set far in the future: no new sign-in, no session renewal. Its saved
-- sessions are also deleted, so it's signed out at the latest when its
-- current access token expires (up to an hour).
create or replace function admin_set_user_blocked(p_user_id uuid, p_blocked boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'not_admin';
  end if;
  if exists (select 1 from admins where user_id = p_user_id) then
    raise exception 'admin_account';
  end if;
  update auth.users
    set banned_until = case when p_blocked then now() + interval '100 years' else null end
    where id = p_user_id;
  if not found then
    raise exception 'user_not_found';
  end if;
  if p_blocked then
    delete from auth.sessions where user_id = p_user_id;
  end if;
end $$;

-- Deletes an account for good. Its player stays (results are the player's,
-- not the account's) and is just unlinked; its pending request goes with it.
create or replace function admin_delete_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'not_admin';
  end if;
  if exists (select 1 from admins where user_id = p_user_id) then
    raise exception 'admin_account';
  end if;
  delete from auth.users where id = p_user_id;
  if not found then
    raise exception 'user_not_found';
  end if;
end $$;

-- Signed-in accounts only (each function also checks is_admin() itself).
revoke execute on function admin_list_users() from public, anon;
revoke execute on function admin_approve_claim(uuid) from public, anon;
revoke execute on function admin_reject_claim(uuid) from public, anon;
revoke execute on function admin_set_user_player(uuid, uuid) from public, anon;
revoke execute on function admin_set_user_blocked(uuid, boolean) from public, anon;
revoke execute on function admin_delete_user(uuid) from public, anon;
grant execute on function admin_list_users() to authenticated;
grant execute on function admin_approve_claim(uuid) to authenticated;
grant execute on function admin_reject_claim(uuid) to authenticated;
grant execute on function admin_set_user_player(uuid, uuid) to authenticated;
grant execute on function admin_set_user_blocked(uuid, boolean) to authenticated;
grant execute on function admin_delete_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Player login: each account's own profile (account.html, "Profilo") — one
-- row per account, not per player, so it's there before any player claim is
-- approved and stays with the person if the admin moves the link. Only its
-- owner writes it; the owner and the admin read it. Added by
-- supabase/migrations/004_profiles.sql.
-- ---------------------------------------------------------------------------

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- One line, at most 50 characters, since supabase/migrations/012_description_one_line.sql
  -- (140 since 006, 500 before).
  description text check (char_length(description) <= 50 and description !~ '[\r\n]'),
  -- Favourite colors as a WUBRG-ordered string ('' = none, 'UB', 'WUBRG'…);
  -- the check allows only that order, each color at most once.
  fav_colors text not null default '' check (fav_colors ~ '^W?U?B?R?G?$'),
  fav_commander_id uuid references commanders(id) on delete set null,
  -- The card whose art is the card's background (any Magic card, by name —
  -- looked up on Scryfall), since supabase/migrations/014_fav_card.sql;
  -- fav_commander_id above is the older favourite commander, no longer
  -- written (cleared on save), only a fallback for cards saved before 014.
  fav_card text check (char_length(fav_card) between 1 and 200),
  -- Which printing's art (a Scryfall card id), picked on account.html's
  -- "Versione"; null = Scryfall's default printing of fav_card. Added by
  -- supabase/migrations/015_fav_card_print.sql.
  fav_card_print uuid,
  -- (fav_archetype, the favourite archetype, dropped by
  -- supabase/migrations/013_drop_fav_archetype.sql.)
  -- Whether the player card shows the Google picture (false: the initial).
  -- Added by supabase/migrations/005_profile_show_avatar.sql.
  show_avatar boolean not null default true,
  -- Whether the card is shown on the player's page (public_player_card()
  -- below). Added by supabase/migrations/007_public_player_card.sql.
  show_on_player_page boolean not null default true,
  -- The owner's usernames, shown as links on the card (the site builds the
  -- links). Added by supabase/migrations/010_card_links_follows.sql.
  instagram text check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  moxfield text check (moxfield ~ '^[A-Za-z0-9_-]{1,40}$'),
  archidekt text check (archidekt ~ '^[A-Za-z0-9_.-]{1,40}$'),
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

-- The card of the account linked to a player, for everyone (player.html) —
-- profiles itself stays private. Nothing when the player isn't linked, the
-- account never saved its card (no profiles row before the first save), its
-- owner hides it, or the account is blocked. The Google picture only when
-- shown on the card; has_picture tells "hidden by the owner" (no circle)
-- from "no Google picture" (the initial). Added by
-- supabase/migrations/007_public_player_card.sql; the card's links since
-- 010; no archetype since 013; commander_name is the background card's
-- name since 014 (fav_card, else the old favourite commander's), with its
-- printing (card_print) since 015.
create or replace function public_player_card(p_player_id uuid)
returns table (
  description text,
  fav_colors text,
  show_avatar boolean,
  has_picture boolean,
  avatar_url text,
  commander_name text,
  card_print uuid,
  instagram text,
  moxfield text,
  archidekt text
)
language sql stable security definer set search_path = public as $$
  select
    pr.description,
    pr.fav_colors,
    pr.show_avatar,
    (u.raw_user_meta_data ->> 'avatar_url') is not null,
    case when pr.show_avatar then u.raw_user_meta_data ->> 'avatar_url' end,
    coalesce(pr.fav_card, c.name),
    -- Only with the card it belongs to (not with an old favourite commander).
    case when pr.fav_card is not null then pr.fav_card_print end,
    pr.instagram,
    pr.moxfield,
    pr.archidekt
  from players p
  join profiles pr on pr.user_id = p.user_id
  join auth.users u on u.id = p.user_id
  left join commanders c on c.id = pr.fav_commander_id
  where p.id = p_player_id
    and pr.show_on_player_page
    and not coalesce(u.banned_until > now(), false);
$$;

grant execute on function public_player_card(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Player login: a user deletes their own login account (account.html). Its
-- profile and pending request go with it, its player is unlinked (and kept).
-- Not for admin accounts. Added by
-- supabase/migrations/006_short_description_delete_account.sql.
-- ---------------------------------------------------------------------------

-- Errors are codes js/account-page.js translates: not_signed_in, admin_account.
create or replace function delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  if is_admin() then
    raise exception 'admin_account';
  end if;
  delete from auth.users where id = uid;
end $$;

revoke execute on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Decklists sent by email (account.html → the send-decklist Edge Function):
-- only *that* a player sent one for an event, never the list — up to two
-- per player and event (attempt 1, 2; 009); the admin deletes a row to allow
-- another. Written only by the function (service role). Added by
-- supabase/migrations/008_decklist_submissions.sql.
-- ---------------------------------------------------------------------------

create table decklist_submissions (
  player_id uuid not null references players(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  -- The account that sent it (the link can move to another account later).
  user_id uuid references auth.users(id) on delete set null,
  sent_at timestamptz not null default now(),
  -- 1st or 2nd send for that event (supabase/migrations/009).
  attempt smallint not null default 1 check (attempt between 1 and 2),
  primary key (player_id, event_id, attempt)
);

alter table decklist_submissions enable row level security;

create policy "decklist_submissions_read_own" on decklist_submissions for select
  using (
    is_admin()
    or exists (select 1 from players p where p.id = decklist_submissions.player_id and p.user_id = auth.uid())
  );

create policy "decklist_submissions_admin_delete" on decklist_submissions for delete
  using (is_admin());

-- ---------------------------------------------------------------------------
-- The players and commanders an account follows (account.html's "Seguiti",
-- the ★ button on player.html / commander.html). Private: each account
-- reads and writes only its own. Added by
-- supabase/migrations/010_card_links_follows.sql.
-- ---------------------------------------------------------------------------

create table follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  commander_id uuid references commanders(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Exactly one of the two.
  check ((player_id is null) <> (commander_id is null)),
  unique (user_id, player_id),
  unique (user_id, commander_id)
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
