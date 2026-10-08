-- 014 — The player card's background: any Magic card, not just a commander.
--
-- * profiles.fav_card: the name of the card whose art is the card's
--   background (looked up on Scryfall by name, account.html picking it
--   from Scryfall's own autocomplete). Existing cards keep their art: it's
--   filled from the favourite commander they had (fav_commander_id, kept
--   for now but no longer written — account.html clears it on save).
-- * public_player_card(): commander_name — the background card's name — is
--   now fav_card, else the old favourite commander's (same result columns,
--   so replaced in place).
--
-- Run once in the SQL editor (dev first). Undo: 014_fav_card_rollback.sql.

alter table profiles
  add column fav_card text check (char_length(fav_card) between 1 and 200);

update profiles pr
set fav_card = c.name
from commanders c
where c.id = pr.fav_commander_id and pr.fav_card is null;

create or replace function public_player_card(p_player_id uuid)
returns table (
  description text,
  fav_colors text,
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
    pr.show_avatar,
    (u.raw_user_meta_data ->> 'avatar_url') is not null,
    case when pr.show_avatar then u.raw_user_meta_data ->> 'avatar_url' end,
    coalesce(pr.fav_card, c.name),
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
