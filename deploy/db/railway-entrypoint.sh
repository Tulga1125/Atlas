#!/bin/sh
set -eu
# Keep the pgsodium/vault key directory on the volume so it survives restarts.
mkdir -p /data/config /data/pgdata
if [ ! -e /data/config/.initialised ]; then
  cp -a /etc/postgresql-custom.dist/. /data/config/ 2>/dev/null || true
  touch /data/config/.initialised
fi
rm -rf /etc/postgresql-custom
ln -s /data/config /etc/postgresql-custom
chown -R postgres:postgres /data
export PGPASSWORD="${POSTGRES_PASSWORD}"
exec docker-entrypoint.sh "$@"
