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
-- and can be a bye (player2_id null, an automatic win for player1), a league
-- row can be flagged as a "Topdeck" series (is_topdeck) — the same shape,
-- just without a points leaderboard; at most one league and, separately, at
-- most one Topdeck can be open at a time (one of each together is fine),
-- and an entry can carry a manual_rank tiebreak override for its event's
-- standings.
-- Re-running this drops and recreates every table, so it wipes existing
-- rows — expected while there's only test data.

create extension if not exists pgcrypto;

drop table if exists matches cascade;
drop table if exists event_entries cascade;
drop table if exists decks cascade;
drop table if exists events cascade;
drop table if exists leagues cascade;
drop table if exists players cascade;
drop table if exists badges cascade;
drop table if exists commanders cascade;
drop type if exists deck_archetype;
drop type if exists match_result;

create type deck_archetype as enum ('aggro', 'control', 'combo', 'tempo', 'midrange');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table commanders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color_identity text not null default '', -- subset of the letters W U B R G, e.g. "BR"
  created_at timestamptz not null default now()
);

create table badges ( -- small icon + name a player can be tagged with (e.g. "Campione", trophy icon)
  id uuid primary key default gen_random_uuid(),
  name text not null unique, -- shown as the tooltip when hovering the icon next to a player's name
  icon text not null, -- one emoji, picked from a fixed pool offered by the admin UI
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null,      -- duplicates allowed (homonyms)
  handle text,              -- optional disambiguator shown next to the name when it collides
  -- Up to 4 badges, each its own nullable slot (not a join table) since the
  -- admin UI is literally fixed dropdowns, not an open-ended list. Only the
  -- first 2 are admin-editable (see admin/js/players-admin.js); badge3/4 are
  -- reserved for a future automatic-assignment rule, not set anywhere yet.
  badge1_id uuid,
  badge2_id uuid,
  badge3_id uuid,
  badge4_id uuid,
  created_at timestamptz not null default now(),
  constraint players_badge1_id_fkey foreign key (badge1_id) references badges(id) on delete set null,
  constraint players_badge2_id_fkey foreign key (badge2_id) references badges(id) on delete set null,
  constraint players_badge3_id_fkey foreign key (badge3_id) references badges(id) on delete set null,
  constraint players_badge4_id_fkey foreign key (badge4_id) references badges(id) on delete set null,
  constraint players_badges_distinct check (
    badge1_id <> badge2_id and badge1_id <> badge3_id and badge1_id <> badge4_id
    and badge2_id <> badge3_id and badge2_id <> badge4_id
    and badge3_id <> badge4_id
  )
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
  league_id uuid references leagues(id) on delete cascade, -- null = standalone event, not part of any league
  rounds integer not null default 1, -- number of turns/rounds, set manually by the admin
  is_open boolean not null default true, -- while open, the event's data is admin-only; closing it publishes it
  created_at timestamptz not null default now(),
  constraint events_unique_name_per_league unique (league_id, name) -- same name OK across leagues, not within one
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

create table matches ( -- one round pairing between two players, scored as a best-of-3 game count
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  round integer not null default 1,
  player1_id uuid not null,
  player2_id uuid, -- null = a bye: player1 had no opponent this round and is scored an automatic win
  player1_wins integer not null default 0,
  draws integer not null default 0,
  player2_wins integer not null default 0,
  created_at timestamptz not null default now(),
  constraint matches_player1_id_fkey foreign key (player1_id) references players(id) on delete restrict,
  constraint matches_player2_id_fkey foreign key (player2_id) references players(id) on delete restrict,
  constraint matches_players_distinct check (player1_id <> player2_id),
  constraint matches_score_valid check (
    player1_wins >= 0 and draws >= 0 and player2_wins >= 0
    and (player1_wins + draws + player2_wins) between 1 and 3
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

-- ---------------------------------------------------------------------------
-- Row Level Security: public read (with the open/closed publishing rule
-- below), admin-only write. "authenticated" = signed in via Supabase Auth.
-- Public sign-up must be disabled in the Supabase dashboard (Authentication
-- > Providers > Email) so only the manually-created admin account(s) can
-- ever be "authenticated".
--
-- Publishing rule: a league is visible whether it's open or closed (an
-- ongoing league still shows on the public site). An *event*'s data
-- (its entries and matches) is only visible to anonymous visitors once the
-- event itself is closed — admins (authenticated) always see everything,
-- open or closed, so they can keep editing it before publishing.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['commanders', 'players', 'badges', 'leagues', 'events', 'event_entries', 'matches']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('create policy "%I_admin_insert" on %I for insert with check (auth.role() = ''authenticated'');', t, t);
    execute format('create policy "%I_admin_update" on %I for update using (auth.role() = ''authenticated'');', t, t);
    execute format('create policy "%I_admin_delete" on %I for delete using (auth.role() = ''authenticated'');', t, t);
  end loop;
end $$;

create policy "commanders_public_read" on commanders for select using (true);
create policy "players_public_read" on players for select using (true);
create policy "badges_public_read" on badges for select using (true);
create policy "leagues_public_read" on leagues for select using (true);

create policy "events_public_read" on events for select
  using (is_open = false or auth.role() = 'authenticated');

create policy "event_entries_public_read" on event_entries for select
  using (
    auth.role() = 'authenticated'
    or exists (select 1 from events e where e.id = event_entries.event_id and e.is_open = false)
  );

create policy "matches_public_read" on matches for select
  using (
    auth.role() = 'authenticated'
    or exists (select 1 from events e where e.id = matches.event_id and e.is_open = false)
  );
