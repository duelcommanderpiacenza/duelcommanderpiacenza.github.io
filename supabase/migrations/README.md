# Migrations

A change to an existing database goes here as a numbered file with its
rollback (`NNN_name.sql` + `NNN_name_rollback.sql`), run in the Supabase SQL
editor on **dcp-dev** first, then live — and is folded into
`../schema.sql`, which stays the from-scratch setup.

**Next number: 034.**

Migrations 001–027 were run on both databases and their files deleted on
2026-10-23; everything they did is in `schema.sql`. A "migration NNN" in
CLAUDE.md or a code comment means that change. To read one (or its
rollback) again:

    git log --oneline -- supabase/migrations/   # the commit that deleted them
    git show <that commit>^:supabase/migrations/027_commander_is_new.sql
