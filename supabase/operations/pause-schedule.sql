-- Keep the approved chart available while investigating collection or deployment.
select cron.unschedule(jobid) from cron.job where jobname in ('atlas-daily-collection','atlas-youtube-retention','atlas-queue-worker');
