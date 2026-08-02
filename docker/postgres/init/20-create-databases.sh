#!/bin/bash
# Runs once, on an empty data volume, after the postgis image's own 10_postgis.sh.
# Creates the application and test databases and enables PostGIS in both.
set -euo pipefail

for db in territory_map territory_map_test; do
  echo "Creating database '$db' with the postgis extension"

  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
SELECT 'CREATE DATABASE "$db"'
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
EOSQL

  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<EOSQL
CREATE EXTENSION IF NOT EXISTS postgis;
EOSQL
done
