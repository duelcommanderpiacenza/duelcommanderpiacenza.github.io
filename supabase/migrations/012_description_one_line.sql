-- 012 — The player card's description: one line, at most 50 characters.
--
-- * profiles.description: at most 50 characters (was 140) and no line
--   breaks, so it stays a short one-liner on the card. Existing
--   descriptions first get their line breaks turned into spaces, then are
--   cut to 50 (the cut part isn't kept).
--
-- Run once in the SQL editor (dev first). Undo: 012_description_one_line_rollback.sql.

update profiles
set description = left(btrim(regexp_replace(description, '\s*[\r\n]+\s*', ' ', 'g')), 50)
where description ~ '[\r\n]' or char_length(description) > 50;

alter table profiles drop constraint profiles_description_check;
alter table profiles add constraint profiles_description_check
  check (char_length(description) <= 50 and description !~ '[\r\n]');
