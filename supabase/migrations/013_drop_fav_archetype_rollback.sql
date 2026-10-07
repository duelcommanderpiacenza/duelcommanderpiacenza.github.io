-- Undoes 013_drop_fav_archetype.sql: the column back (empty — the values
-- dropped by 013 aren't restored) and public_player_card() returning it.

alter table profiles add column fav_archetype deck_archetype;

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
