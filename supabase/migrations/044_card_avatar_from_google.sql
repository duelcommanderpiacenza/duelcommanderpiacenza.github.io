-- 044 (2026-11-18): the player card's picture (public_player_card, shown to
-- everyone on player.html) taken from the account's Google identity, not
-- from its user metadata. The metadata can be rewritten by its own user
-- (supabase.auth.updateUser({ data: { avatar_url } })), so anyone could have
-- put any external address there — every visitor of their player page then
-- loading it (an IP / browser tracker, or any picture at all). The Google
-- identity's data is set by Google at sign-in and can't be edited by the
-- user; on top of that only Google's own picture addresses
-- (lh*.googleusercontent.com) are given out. Every picture in use was
-- already the Google one (13 of 13 on 2026-11-18). An account without a
-- Google identity (e-mail sign-up) has no picture — as before, in practice.
-- Safe to run again. Rollback: 044_card_avatar_from_google_rollback.sql.

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
  archidekt text,
  endstep text
)
language sql stable security definer set search_path = public as $$
  select
    pr.description,
    pr.fav_colors,
    pr.show_avatar,
    g.avatar_url is not null,
    case when pr.show_avatar then g.avatar_url end,
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
  -- The Google picture: set by Google, and only one of its addresses.
  left join lateral (
    select i.identity_data ->> 'avatar_url' as avatar_url
    from auth.identities i
    where i.user_id = u.id
      and i.provider = 'google'
      and i.identity_data ->> 'avatar_url' ~ '^https://lh[0-9]+\.googleusercontent\.com/'
    limit 1
  ) g on true
  where p.id = p_player_id
    and pr.show_on_player_page
    and not coalesce(u.banned_until > now(), false);
$$;

grant execute on function public_player_card(uuid) to anon, authenticated;
