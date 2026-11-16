# One-shot job: applies supabase/migrations in order, recording each in the
# same table the Supabase CLI uses, so later `supabase db push` agrees.
FROM postgres:17-alpine
COPY supabase/migrations /migrations
COPY deploy/migrate/migrate.sh /migrate.sh
CMD ["sh", "/migrate.sh"]
