#!/bin/sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
case "$DATABASE_URL" in *railway.internal*) ;; *) echo "Refusing: DATABASE_URL must point at the Railway private network"; exit 1 ;; esac
for i in $(seq 1 60); do
  pg_isready -d "$DATABASE_URL" -q && break
  echo "waiting for database ($i)"; sleep 5
done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
SQL
applied=0
for file in $(ls /migrations/*.sql | sort); do
  base=$(basename "$file" .sql)
  version=${base%%_*}
  name=${base#*_}
  done_already=$(psql "$DATABASE_URL" -tAq -c "select 1 from supabase_migrations.schema_migrations where version = '$version'")
  if [ "$done_already" = "1" ]; then continue; fi
  echo "applying $base"
  { cat "$file"; printf "\ninsert into supabase_migrations.schema_migrations (version, name) values ('%s', '%s');\n" "$version" "$name"; } \
    | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q --single-transaction
  applied=$((applied + 1))
done
echo "migrations applied: $applied"

# Optional schedule (docs/DEPLOY_RAILWAY.md). Values come from the service's
# variables and are passed as psql variables, never printed.
if [ "${ATLAS_SCHEDULE:-}" = "youtube" ]; then
  : "${ATLAS_SITE_URL:?ATLAS_SITE_URL is required for the schedule}"
  : "${CRON_SECRET:?CRON_SECRET is required for the schedule}"
  psql "$DATABASE_URL" -q -v site_url="$ATLAS_SITE_URL" -v cron_secret="$CRON_SECRET" -f /operations/install-youtube-schedule.sql
  echo "schedule installed: youtube"
fi
