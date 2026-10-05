-- 009 — Up to two decklists per player and event (was one, 008).
--
-- Each send is numbered (attempt 1 or 2) and the primary key now includes
-- it: the send-decklist function claims attempt 1, else attempt 2 (each
-- insert settled by the key, so two sends at the same instant can't both
-- take the same number), else refuses (already_sent). Existing rows become
-- attempt 1. Still only *that* a list was sent — never the list.
--
-- Safe before redeploying the function: the old one inserts without an
-- attempt, so the default 1 keeps it at one send per event until then.
--
-- Run once in the SQL editor (dev first). Undo: 009_two_decklists_per_event_rollback.sql.

alter table decklist_submissions
  add column attempt smallint not null default 1 check (attempt between 1 and 2);

alter table decklist_submissions drop constraint decklist_submissions_pkey;
alter table decklist_submissions add primary key (player_id, event_id, attempt);
