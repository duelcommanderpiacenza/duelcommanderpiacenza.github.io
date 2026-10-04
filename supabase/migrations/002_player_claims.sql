-- 002 — Accounts claim players, the admin approves (step 2 of the player login).
--
-- A signed-in account (js/account-page.js) asks to be linked to an existing
-- player; the admin approves or rejects (step 3, admin "Utenti" tab).
--
-- * players.user_id: the link. At most one account per player and one player
--   per account (unique). Only the admin writes it — the existing
--   "players_admin_update" policy (is_admin()) already covers that, so a
--   user can never link themselves directly.
-- * player_claims: pending requests. At most one per account (primary key)
--   and one per player (unique). Users read only their own; no insert/update
--   policies — requests go only through request_player_claim(), which checks
--   every rule first.
--
-- Run once in the SQL editor (dev first). Undo: 002_player_claims_rollback.sql.

alter table players
  add column user_id uuid unique references auth.users(id) on delete set null;

create table player_claims (
  user_id uuid primary key references auth.users(id) on delete cascade,
  player_id uuid not null unique references players(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table player_claims enable row level security;

create policy "player_claims_read_own" on player_claims for select
  using (user_id = auth.uid() or is_admin());

create policy "player_claims_admin_delete" on player_claims for delete
  using (is_admin());

-- The signed-in user asks for p_player_id. Errors (the message is a code
-- js/account-page.js translates): not_signed_in, already_linked (this
-- account already has a player), request_pending (it already asked for
-- one), player_not_found, player_taken (already linked to someone),
-- player_requested (someone else already asked for it).
create or replace function request_player_claim(p_player_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  if exists (select 1 from players where user_id = uid) then
    raise exception 'already_linked';
  end if;
  if exists (select 1 from player_claims where user_id = uid) then
    raise exception 'request_pending';
  end if;
  if not exists (select 1 from players where id = p_player_id) then
    raise exception 'player_not_found';
  end if;
  if exists (select 1 from players where id = p_player_id and user_id is not null) then
    raise exception 'player_taken';
  end if;
  if exists (select 1 from player_claims where player_id = p_player_id) then
    raise exception 'player_requested';
  end if;
  insert into player_claims (user_id, player_id) values (uid, p_player_id);
exception
  -- Two requests for the same player at the same instant: the unique
  -- constraint settles it, reported like the check above.
  when unique_violation then
    raise exception 'player_requested';
end $$;

-- The signed-in user withdraws their own pending request (if any).
create or replace function cancel_player_claim() returns void
language sql security definer set search_path = public as $$
  delete from player_claims where user_id = auth.uid();
$$;

-- Signed-in accounts only (functions are executable by everyone by default).
revoke execute on function request_player_claim(uuid) from public, anon;
revoke execute on function cancel_player_claim() from public, anon;
grant execute on function request_player_claim(uuid) to authenticated;
grant execute on function cancel_player_claim() to authenticated;
