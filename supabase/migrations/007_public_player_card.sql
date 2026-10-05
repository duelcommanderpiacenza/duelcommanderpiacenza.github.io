-- 007 — The player card on the public player page (player login, after
-- step 4).
--
-- * profiles.show_on_player_page: whether the owner shows their card on
--   their player's page (player.html). Set from account.html's "Le tue
--   statistiche" switch; covered by the existing profiles_*_own policies.
-- * public_player_card(p_player_id): the card of the account linked to that
--   player, readable by everyone (profiles itself stays private). Nothing
--   when the player isn't linked, the account never saved its card (a
--   profiles row only exists after the first save), its owner hides it, or
--   the account is blocked. The Google picture (from the account's own
--   sign-in data) only when the owner shows it on the card (show_avatar);
--   has_picture tells "hidden by the owner" (no circle) from "no Google
--   picture at all" (the initial).
--
-- Run once in the SQL editor (dev first). Undo: 007_public_player_card_rollback.sql.

alter table profiles
  add column show_on_player_page boolean not null default true;

create or replace function public_player_card(p_player_id uuid)
returns table (
  description text,
  fav_colors text,
  fav_archetype deck_archetype,
  show_avatar boolean,
  has_picture boolean,
  avatar_url text,
  commander_name text
)
language sql stable security definer set search_path = public as $$
  select
    pr.description,
    pr.fav_colors,
    pr.fav_archetype,
    pr.show_avatar,
    (u.raw_user_meta_data ->> 'avatar_url') is not null,
    case when pr.show_avatar then u.raw_user_meta_data ->> 'avatar_url' end,
    c.name
  from players p
  join profiles pr on pr.user_id = p.user_id
  join auth.users u on u.id = p.user_id
  left join commanders c on c.id = pr.fav_commander_id
  where p.id = p_player_id
    and pr.show_on_player_page
    and not coalesce(u.banned_until > now(), false);
$$;

grant execute on function public_player_card(uuid) to anon, authenticated;
