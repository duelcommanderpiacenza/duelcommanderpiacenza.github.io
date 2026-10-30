-- Rollback of 032_profile_endstep.sql: public_player_card() without the
-- endstep column (as migration 015 left it), then the column itself dropped
-- (the usernames saved in it are lost).

drop function if exists public_player_card(uuid);

create function public_player_card(p_player_id uuid)
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

alter table profiles drop column if exists endstep;
