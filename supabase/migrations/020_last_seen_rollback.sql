-- Undoes 020_last_seen.sql: admin_list_users() without last_seen_at (as
-- after 003 — "Ultimo accesso" back to the last login), and the visits
-- forgotten.

drop function if exists admin_list_users();

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

revoke execute on function admin_list_users() from public, anon;
grant execute on function admin_list_users() to authenticated;

drop function if exists touch_last_seen();
drop table if exists user_activity;
