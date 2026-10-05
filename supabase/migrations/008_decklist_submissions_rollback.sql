-- Undoes 008_decklist_submissions.sql: forgets which decklists were sent
-- (the emails themselves are unaffected).
drop table if exists decklist_submissions;
