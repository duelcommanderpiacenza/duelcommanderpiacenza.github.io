-- 013 — The player card no longer has a favourite archetype.
--
-- * profiles.fav_archetype: dropped (the card shows and edits it no more;
--   the values saved so far go with it).
-- * public_player_card(): no longer returns it (its result changes, so
--   it's dropped and created again).
--
-- The deck_archetype type stays: event_entries.archetype uses it.
--
-- Run once in the SQL editor (dev first) — on live only once the site
-- without the archetype is published (the old one still saves it, and its
-- saves would fail). Undo: 013_drop_fav_archetype_rollback.sql.

drop function if exists public_player_card(uuid);

create function public_player_card(p_player_id uuid)
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

alter table profiles drop column fav_archetype;
