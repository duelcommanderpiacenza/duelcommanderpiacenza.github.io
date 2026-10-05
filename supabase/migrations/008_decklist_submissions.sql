-- 008 — Sending a decklist by email (after the player login went live).
--
-- A signed-in account linked to a player sends its decklist for an event
-- from account.html; the send-decklist Edge Function
-- (supabase/functions/send-decklist) emails it to the organisers. The list
-- itself is never stored — only *that* the player sent one for the event,
-- here, so each player sends one per event (the primary key). To allow a
-- resend (a wrong list), the admin deletes that row.
--
-- * Written only by the function (it uses the service role, which skips
--   RLS): no insert/update policies, so no one can mark a list as sent, or
--   unmark it, from the site.
-- * Read by the account linked to the player (account.html shows which
--   events it already sent for) and by the admin.
--
-- Run once in the SQL editor (dev first). Undo: 008_decklist_submissions_rollback.sql.

create table decklist_submissions (
  player_id uuid not null references players(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  -- The account that sent it (the link can move to another account later).
  user_id uuid references auth.users(id) on delete set null,
  sent_at timestamptz not null default now(),
  primary key (player_id, event_id)
);

alter table decklist_submissions enable row level security;

create policy "decklist_submissions_read_own" on decklist_submissions for select
  using (
    is_admin()
    or exists (select 1 from players p where p.id = decklist_submissions.player_id and p.user_id = auth.uid())
  );

create policy "decklist_submissions_admin_delete" on decklist_submissions for delete
  using (is_admin());
