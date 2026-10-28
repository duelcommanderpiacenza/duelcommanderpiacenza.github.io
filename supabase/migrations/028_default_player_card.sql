-- 028: a default player card.
--
-- When an account is linked to its player (the admin approving its request,
-- or linking it directly), and it has no card yet, it gets one: the
-- background is the player's most played commander (closed events, either
-- seat; ties: the most recently played, then by name), no photo (the
-- initial — the owner turns the photo on if they want it), shown on the
-- player's page like any saved card. Set once, never recomputed: from then
-- on it's an ordinary card the owner changes as they like. A player with no
-- results yet gets none.
--
-- Also run once below for the accounts already linked with no card.
-- Rollback: 028_default_player_card_rollback.sql.

create or replace function give_default_card(p_user_id uuid, p_player_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if exists (select 1 from profiles where user_id = p_user_id) then
    return;
  end if;
  select c.name into v_name
  from (
    select ee.commander_id as commander_id, e.event_date
    from event_entries ee join events e on e.id = ee.event_id
    where ee.player_id = p_player_id and not e.is_open
    union all
    select ee.partner_commander_id, e.event_date
    from event_entries ee join events e on e.id = ee.event_id
    where ee.player_id = p_player_id and not e.is_open and ee.partner_commander_id is not null
  ) played
  join commanders c on c.id = played.commander_id
  group by c.id, c.name
  order by count(*) desc, max(played.event_date) desc nulls last, c.name
  limit 1;
  if v_name is null then
    return;
  end if;
  insert into profiles (user_id, fav_card, show_avatar)
  values (p_user_id, v_name, false)
  on conflict (user_id) do nothing;
end $$;

-- Only for the functions below (they run as its owner), never called directly.
revoke execute on function give_default_card(uuid, uuid) from public, anon, authenticated;

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
  perform give_default_card(p_user_id, v_player_id);
end $$;

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
    perform give_default_card(p_user_id, p_player_id);
  end if;
end $$;

-- The accounts already linked with no card: theirs now.
select give_default_card(p.user_id, p.id) from players p where p.user_id is not null;
