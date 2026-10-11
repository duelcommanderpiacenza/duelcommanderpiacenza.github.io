-- 020 — "Ultimo accesso" in the admin's Utenti tab: the last time each
-- account was actually on the site, not just its last login (a session lasts
-- weeks, so last_sign_in_at missed every visit in between).
--
-- * user_activity: one row per signed-in account, its last visit. Written
--   only by touch_last_seen() (security definer: the caller's own row),
--   which the public pages call on load while signed in, at most every 10
--   minutes (js/header-account.js); no policies, nobody reads it directly.
-- * admin_list_users(): also returns last_seen_at (its result changes, so
--   it's dropped and created again, with its grants).
--
-- Run once in the SQL editor (dev first). Undo: 020_last_seen_rollback.sql.

create table user_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

-- No policies: nobody reads or writes it directly — touch_last_seen() below
-- writes the caller's own row, admin_list_users() reads it for the admin.
alter table user_activity enable row level security;

-- The signed-in caller was just on the site: their row's time set to now.
create or replace function touch_last_seen() returns void
language sql volatile security definer set search_path = public as $$
  insert into user_activity (user_id, last_seen_at)
  select auth.uid(), now()
  where auth.uid() is not null
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at;
$$;

revoke execute on function touch_last_seen() from public, anon;
grant execute on function touch_last_seen() to authenticated;

drop function if exists admin_list_users();

create or replace function admin_list_users()
returns table (
  user_id uuid,
  email text,
  providers text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  last_seen_at timestamptz,
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
      act.last_seen_at,
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
    left join user_activity act on act.user_id = u.id
    left join players lp on lp.user_id = u.id
    left join player_claims c on c.user_id = u.id
    left join players cp on cp.id = c.player_id
    order by u.created_at desc;
end $$;

revoke execute on function admin_list_users() from public, anon;
grant execute on function admin_list_users() to authenticated;
