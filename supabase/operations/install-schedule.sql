-- Apply separately, once deployment and Apple Music access are verified.
-- First store atlas_site_url and atlas_cron_secret in Supabase Vault through the
-- dashboard. Never put their values in a migration or a cron command.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$
begin
 if not exists(select 1 from vault.decrypted_secrets where name='atlas_site_url' and decrypted_secret ~ '^https://')
 or not exists(select 1 from vault.decrypted_secrets where name='atlas_cron_secret' and length(decrypted_secret)>=32)
 then raise exception 'Configure atlas_site_url and atlas_cron_secret in Vault first'; end if;
end $$;
-- pg_cron expressions use UTC: 22:00 UTC is 06:00 Asia/Ulaanbaatar next day.
select cron.schedule('atlas-daily-collection','0 22 * * *',
 $$select public.enqueue_collection((now() at time zone 'Asia/Ulaanbaatar')::date);$$);
-- 21:00 UTC is 05:00 Asia/Ulaanbaatar, before the 05:30 YouTube collection
-- (D6). Deletes only expired YouTube data; see docs/OPERATIONS.md.
select cron.schedule('atlas-youtube-retention','0 21 * * *',
 $$select public.enqueue_youtube_retention((now() at time zone 'Asia/Ulaanbaatar')::date);$$);
-- 21:15 UTC is 05:15 Asia/Ulaanbaatar: find candidate videos (A2) before the
-- 05:30 statistics collection. Needs YOUTUBE_API_KEY on the server.
select cron.schedule('atlas-youtube-discovery','15 21 * * *',
 $$select public.enqueue_youtube_discovery((now() at time zone 'Asia/Ulaanbaatar')::date);$$);
select cron.schedule('atlas-queue-worker','* * * * *',$$
 select net.http_post(
  url:=(select decrypted_secret from vault.decrypted_secrets where name='atlas_site_url')||'/api/internal/worker',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='atlas_cron_secret')),
  body:='{}'::jsonb,timeout_milliseconds:=65000
 ) where exists(select 1 from public.pipeline_jobs where (status='queued' and available_at<=now()) or (status='running' and lease_until<now()));
$$);
commit;
