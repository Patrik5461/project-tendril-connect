CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('sync-ppa-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ppa-daily');

SELECT cron.schedule(
  'sync-ppa-daily',
  '15 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--50e4e6a8-256b-47bb-bfde-c3e5d7cfcd8a.lovable.app/api/public/hooks/sync-ppa',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtc3N4bmx1aGpoenFtdXRmbGJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNzQ2MzcsImV4cCI6MjA5ODg1MDYzN30.-pl_XY06sOShITzwFJkYZcmHcfDaJFI_x9J3nxXVbiY"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);