-- 032 (2026-10-30): the player card's endstep.cc link. Safe to run again.
--
-- The owner's endstep.cc username (profiles.endstep), shown on the card as a
-- link beside Instagram / Moxfield / Archidekt (migration 010): only the
-- username is stored — the site builds https://endstep.cc/u/<username> — so
-- the same check as Archidekt's. public_player_card() returns it too (its
-- result's columns change: dropped and made again).
-- Rollback: 032_profile_endstep_rollback.sql.

alter table profiles add column if not exists endstep text
  check (endstep ~ '^[A-Za-z0-9_.-]{1,40}$');

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
  archidekt text,
  endstep text
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
    pr.archidekt,
    pr.endstep
  from players p
  join profiles pr on pr.user_id = p.user_id
  join auth.users u on u.id = p.user_id
  left join commanders c on c.id = pr.fav_commander_id
  where p.id = p_player_id
    and pr.show_on_player_page
    and not coalesce(u.banned_until > now(), false);
$$;

grant execute on function public_player_card(uuid) to anon, authenticated;
