#!/usr/bin/env bash
# Copies the live database's content (results, players, events, …) into
# dcp-dev, replacing dev's — so local testing (localhost uses dcp-dev, see
# js/supabase-client.js) sees the real data. Live is only read.
#
# Copied: the site's own tables below. Not copied: anything tied to a login
# account (admins, profiles, player_claims, user_settings,
# user_activity, decklist_submissions) — the two projects have separate
# accounts, so those rows would point nowhere; for the same reason every
# player's account link (players.user_id) is cleared in dev (link dev
# accounts again from dev's admin, Utenti). Dev's own rows in those account
# tables that point at players / events / leagues / commanders are removed
# with them (truncate … cascade). Both databases must have run the same
# migrations (same columns).
#
# Needs pg_dump / psql (in WSL: sudo apt install postgresql-client — a
# version at least as new as the databases' Postgres) and the two
# connection strings from each project's dashboard (Connect → Session pooler
# URI, with the database password), passed as environment variables — never
# written in a file:
#
#   export PROD_DB_URL='postgresql://postgres.avgogarpoqsfzstmputm:…@….pooler.supabase.com:5432/postgres'
#   export DEV_DB_URL='postgresql://postgres.xylxqwufckkyzrgtfbxi:…@….pooler.supabase.com:5432/postgres'
#   bash scripts/copy-prod-to-dev.sh
set -euo pipefail

PROD_REF=avgogarpoqsfzstmputm
DEV_REF=xylxqwufckkyzrgtfbxi
TABLES=(commanders badges players leagues events event_entries matches announcements player_badges_auto event_standings player_progress)

: "${PROD_DB_URL:?set PROD_DB_URL (the live project's connection string)}"
: "${DEV_DB_URL:?set DEV_DB_URL (dcp-dev's connection string)}"
# The one mistake that must never happen: writing into live.
[[ "$DEV_DB_URL" == *"$DEV_REF"* ]] || { echo "DEV_DB_URL isn't dcp-dev ($DEV_REF): stopped." >&2; exit 1; }
[[ "$DEV_DB_URL" != *"$PROD_REF"* ]] || { echo "DEV_DB_URL points at live: stopped." >&2; exit 1; }
[[ "$PROD_DB_URL" == *"$PROD_REF"* ]] || { echo "PROD_DB_URL isn't the live project ($PROD_REF): stopped." >&2; exit 1; }

dump=$(mktemp)
trap 'rm -f "$dump"' EXIT

echo "Reading live…"
pg_dump "$PROD_DB_URL" --data-only --no-owner --no-privileges "${TABLES[@]/#/--table=public.}" -f "$dump"

echo "Writing dcp-dev…"
# Schema-qualified everywhere: the dump empties search_path for its own
# statements, so a bare table name after it isn't found.
list=$(printf 'public.%s,' "${TABLES[@]}"); list=${list%,}
# One transaction: all or nothing. session_replication_role = replica:
# triggers off while loading (no "Risultati online" announcements made for
# every closed event, no foreign-key checks on the way — the copy is whole).
psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
begin;
set session_replication_role = replica;
truncate ${list} cascade;
\i ${dump}
update public.players set user_id = null where user_id is not null;
set session_replication_role = origin;
commit;
SQL

echo "Done. Row counts in dcp-dev:"
for t in "${TABLES[@]}"; do
  printf '  %-20s %s\n' "$t" "$(psql "$DEV_DB_URL" -tAc "select count(*) from public.$t")"
done
