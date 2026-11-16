#!/bin/sh
set -eu
# Railway mounts the service's one volume at /data. Supabase's postgresql.conf
# pins data_directory to /var/lib/postgresql/data, so that path becomes a
# symlink into the volume. The key directory (/etc/postgresql-custom) is kept
# on the volume too, so vault secrets survive restarts.
# /data/pgdata and /data/postgres were failed first attempts (16 Nov 2026,
# before any data existed); the cluster lives in /data/pg.
rm -rf /data/pgdata /data/postgres
mkdir -p /data/config /data/pg
if [ ! -e /data/config/.initialised ]; then
  cp -a /etc/postgresql-custom.dist/. /data/config/ 2>/dev/null || true
  touch /data/config/.initialised
fi
rm -rf /etc/postgresql-custom /var/lib/postgresql/data
ln -s /data/config /etc/postgresql-custom
ln -s /data/pg /var/lib/postgresql/data
chown -R postgres:postgres /data /etc/postgresql-custom /var/lib/postgresql/data
chmod 0700 /data/pg
export PGDATA=/var/lib/postgresql/data
exec docker-entrypoint.sh "$@"
