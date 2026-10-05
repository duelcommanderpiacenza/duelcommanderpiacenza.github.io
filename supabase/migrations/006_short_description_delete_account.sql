-- 006 — A shorter profile description, and deleting one's own account
-- (step 4 of the player login).
--
-- * profiles.description: at most 140 characters (was 500), so it fits the
--   player card. Longer existing descriptions are cut to 140 first.
-- * delete_my_account(): the signed-in user deletes their own login account.
--   Deleting the auth user cascades to their profile and pending claim
--   request, and unlinks their player (players.user_id → null); the player
--   and its results stay. Admin accounts can't delete themselves this way
--   (admin_account), so the admin can't lock themselves out. A deleted user
--   can sign in with Google again — that creates a new, empty account.
--
-- Run once in the SQL editor (dev first). Undo: 006_short_description_delete_account_rollback.sql.

update profiles set description = left(description, 140) where char_length(description) > 140;
alter table profiles drop constraint profiles_description_check;
alter table profiles add constraint profiles_description_check check (char_length(description) <= 140);

-- Errors are codes js/account-page.js translates: not_signed_in, admin_account.
create or replace function delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  if is_admin() then
    raise exception 'admin_account';
  end if;
  delete from auth.users where id = uid;
end $$;

revoke execute on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
