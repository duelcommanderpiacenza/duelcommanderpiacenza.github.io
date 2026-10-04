-- Undoes 003_admin_users.sql: drops the admin's user-management functions.
-- (Blocks, deletions and links already made stay as they are.)
drop function if exists admin_delete_user(uuid);
drop function if exists admin_set_user_blocked(uuid, boolean);
drop function if exists admin_set_user_player(uuid, uuid);
drop function if exists admin_reject_claim(uuid);
drop function if exists admin_approve_claim(uuid);
drop function if exists admin_list_users();
