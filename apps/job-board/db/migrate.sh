#!/usr/bin/env bash
# Apply forward-only migrations, then re-create the logic schemas from api.sql.
# Usage: DATABASE_URL=<owner url> ./migrate.sh
# Runs in CI (deploy.yml, against Neon main) and in ci.yml (against a postgres:17 service container).
set -euo pipefail
cd "$(dirname "$0")"
psql() { command psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

psql -c "create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())"
for f in migrations/*.sql; do
  name=$(basename "$f")
  if [ -z "$(psql -tA -c "select 1 from public.schema_migrations where name = '$name'")" ]; then
    echo "migrate: $name"
    # One transaction per file, recorded in the same transaction.
    { cat "$f"; echo; echo "insert into public.schema_migrations (name) values ('$name');"; } | psql -1
  fi
done

echo "api: re-creating lib, cmd, gate"
psql -1 -f api.sql

echo "assert: role privileges"
psql -f assert_privileges.sql
