-- Rollback of 028_default_player_card.sql: linking an account no longer
-- gives it a card. The default cards already created stay (they're ordinary
-- profiles rows, indistinguishable from saved ones; the owners may have
-- edited them since).

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
  end if;
end $$;

drop function if exists give_default_card(uuid, uuid);
