# Self-hosted Supabase Postgres for Railway (same image as Supabase's own
# docker-compose). Railway gives a service one volume, mounted at /data, so the
# data directory and the key directory (/etc/postgresql-custom) both live there.
FROM supabase/postgres:17.6.1.136
COPY deploy/db/roles.sql /docker-entrypoint-initdb.d/init-scripts/99-roles.sql
COPY deploy/db/jwt.sql /docker-entrypoint-initdb.d/init-scripts/99-jwt.sql
COPY deploy/db/railway-entrypoint.sh /usr/local/bin/railway-entrypoint.sh
RUN chmod +x /usr/local/bin/railway-entrypoint.sh && cp -a /etc/postgresql-custom /etc/postgresql-custom.dist
ENV PGDATA=/var/lib/postgresql/data POSTGRES_HOST=/var/run/postgresql PGPORT=5432 POSTGRES_PORT=5432 POSTGRES_DB=postgres PGDATABASE=postgres JWT_EXP=3600
ENTRYPOINT ["railway-entrypoint.sh"]
CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf", "-c", "log_min_messages=fatal"]
