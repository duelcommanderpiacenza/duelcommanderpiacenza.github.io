-- 003 — The admin's user management (step 3 of the player login).
--
-- Login accounts live in Supabase's own auth.users, which the API never
-- exposes — so the admin app's "Utenti" tab works only through these
-- functions. Each is security definer (runs with the rights to read/change
-- auth.users) and first checks is_admin(): for anyone else it raises
-- not_admin and does nothing.
--
-- Errors are codes the admin app translates: not_admin, user_not_found,
-- claim_not_found, player_not_found, admin_account (admin accounts can't be
-- blocked or deleted from here, so the admin can't lock themselves out).
--
-- Run once in the SQL editor (dev first). Undo: 003_admin_users_rollback.sql.

-- Every account: sign-in method(s), dates, admin/blocked, linked player,
-- pending request. Newest accounts first.
create or replace function admin_list_users()
returns table (
  user_id uuid,
  email text,
  providers text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  is_admin boolean,
  is_blocked boolean,
  player_id uuid,
  player_name text,
  player_handle text,
  claim_player_id uuid,
  claim_player_name text,
  claim_player_handle text,
  claim_created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
-- (The output columns above share names with table columns — user_id,
-- created_at, … — inside the query, a bare name means the table's column.)
begin
  if not is_admin() then
    raise exception 'not_admin';
  end if;
  return query
    select
      u.id,
      u.email::text,
      coalesce((select string_agg(p, ', ') from jsonb_array_elements_text(u.raw_app_meta_data -> 'providers') p), ''),
      u.created_at,
      u.last_sign_in_at,
      exists (select 1 from admins a where a.user_id = u.id),
      coalesce(u.banned_until > now(), false),
      lp.id,
      lp.name,
      lp.handle,
      cp.id,
      cp.name,
      cp.handle,
      c.created_at
    from auth.users u
    left join players lp on lp.user_id = u.id
    left join player_claims c on c.user_id = u.id
    left join players cp on cp.id = c.player_id
    order by u.created_at desc;
end $$;

-- Approves an account's pending request: links it to the requested player,
-- removing that player's link to any other account and this account's link
-- to any other player (one each way).
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

create or replace function admin_reject_claim(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'not_admin';
  end if;
  delete from player_claims where user_id = p_user_id;
end $$;

-- Links an account to a player directly (p_player_id), or unlinks it
-- (p_player_id null). Moving a player away from another account is allowed:
-- the admin can change any link at any time. Any pending request of this
-- account, or for this player, is dropped — it's been decided.
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

-- Blocks (or unblocks) an account. Blocked = Supabase Auth's own ban date,
-- set far in the future: no new sign-in, no session renewal. Its saved
-- sessions are also deleted, so it's signed out at the latest when its
-- current access token expires (up to an hour).
create or replace function admin_set_user_blocked(p_user_id uuid, p_blocked boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'not_admin';
  end if;
  if exists (select 1 from admins where user_id = p_user_id) then
    raise exception 'admin_account';
  end if;
  update auth.users
    set banned_until = case when p_blocked then now() + interval '100 years' else null end
    where id = p_user_id;
  if not found then
    raise exception 'user_not_found';
  end if;
  if p_blocked then
    delete from auth.sessions where user_id = p_user_id;
  end if;
end $$;

-- Deletes an account for good. Its player stays (results are the player's,
-- not the account's) and is just unlinked; its pending request goes with it.
create or replace function admin_delete_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'not_admin';
  end if;
  if exists (select 1 from admins where user_id = p_user_id) then
    raise exception 'admin_account';
  end if;
  delete from auth.users where id = p_user_id;
  if not found then
    raise exception 'user_not_found';
  end if;
end $$;

-- Signed-in accounts only (each function also checks is_admin() itself).
revoke execute on function admin_list_users() from public, anon;
revoke execute on function admin_approve_claim(uuid) from public, anon;
revoke execute on function admin_reject_claim(uuid) from public, anon;
revoke execute on function admin_set_user_player(uuid, uuid) from public, anon;
revoke execute on function admin_set_user_blocked(uuid, boolean) from public, anon;
revoke execute on function admin_delete_user(uuid) from public, anon;
grant execute on function admin_list_users() to authenticated;
grant execute on function admin_approve_claim(uuid) to authenticated;
grant execute on function admin_reject_claim(uuid) to authenticated;
grant execute on function admin_set_user_player(uuid, uuid) to authenticated;
grant execute on function admin_set_user_blocked(uuid, boolean) to authenticated;
grant execute on function admin_delete_user(uuid) to authenticated;
