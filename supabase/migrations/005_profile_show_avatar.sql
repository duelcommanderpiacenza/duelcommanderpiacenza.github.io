-- 005 — Hide the Google picture on the player card (step 4 of the player login).
--
-- profiles.show_avatar: whether account.html's player card shows the
-- account's Google profile picture (true) or just its initial (false). Set
-- by the owner in the card's edit mode; covered by the existing
-- profiles_insert_own / profiles_update_own policies.
--
-- Run once in the SQL editor (dev first). Undo: 005_profile_show_avatar_rollback.sql.

alter table profiles
  add column show_avatar boolean not null default true;
