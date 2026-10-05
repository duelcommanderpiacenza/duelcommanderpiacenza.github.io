-- 010 — Links on the player card, and following players and commanders.
--
-- * profiles.instagram / moxfield / archidekt: the owner's usernames on
--   those sites, shown as links on the card (account.html, and player.html
--   when the card is shown there). Usernames only — the site builds the
--   links itself (js/player-card.js), and account.html accepts a pasted
--   profile link only from that site's own address — so the checks below
--   allow nothing but a plain username.
-- * public_player_card(): also returns the three (its result changes, so
--   it's dropped and created again).
-- * follows: the players and commanders an account follows (account.html's
--   "Seguiti" card, the ★ button on player.html / commander.html). One row
--   per followed player or commander; private — each account reads and
--   writes only its own; not its own linked player.
--
-- Run once in the SQL editor (dev first). Undo: 010_card_links_follows_rollback.sql.

alter table profiles
  add column instagram text check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  add column moxfield text check (moxfield ~ '^[A-Za-z0-9_-]{1,40}$'),
  add column archidekt text check (archidekt ~ '^[A-Za-z0-9_.-]{1,40}$');

drop function if exists public_player_card(uuid);

create function public_player_card(p_player_id uuid)
returns table (
  description text,
  fav_colors text,
  fav_archetype deck_archetype,
  show_avatar boolean,
  has_picture boolean,
  avatar_url text,
  commander_name text,
  instagram text,
  moxfield text,
  archidekt text
)
language sql stable security definer set search_path = public as $$
  select
    pr.description,
    pr.fav_colors,
    pr.fav_archetype,
    pr.show_avatar,
    (u.raw_user_meta_data ->> 'avatar_url') is not null,
    case when pr.show_avatar then u.raw_user_meta_data ->> 'avatar_url' end,
    c.name,
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
