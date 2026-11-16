# Routes the public Supabase URL to Auth (/auth/v1) and PostgREST (/rest/v1)
# over Railway's private network. Stands in for Kong in Supabase's compose.
FROM caddy:2.10-alpine
COPY deploy/gateway/Caddyfile /etc/caddy/Caddyfile
