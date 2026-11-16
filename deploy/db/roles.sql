-- Based on supabase/supabase docker/volumes/db/roles.sql. Passwords come from
-- POSTGRES_PASSWORD (a Railway variable). Only the roles this deployment uses:
-- Edge Functions and Storage are not deployed, so their roles do not exist.
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
