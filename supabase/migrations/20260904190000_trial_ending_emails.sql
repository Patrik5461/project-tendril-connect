-- Maily okolo konca trialu (edge funkcia send-trial-ending).
-- expire_trials() beží o 03:15 a status len prehodí na 'expired' – nikomu nič
-- nepošle, a digesty aj pripomienky termínov expirovaných preskakujú. Bez tohto
-- zákazníkovi maily zo dňa na deň prestanú chodiť bez jediného slova.

-- 1) Značky, aby ten istý mail neodišiel druhý raz.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS trial_ending_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ended_email_sent_at  timestamptz;

-- 2) Dvojici, ktorej trial skončil 4. 9. 2026, oznam odišiel ručne ešte pred
--    týmto stĺpcom; starším expirovaným ho spätne posielať nechceme.
--    Označiť ich treba, inak ich prvý beh cronu pošle znova.
UPDATE public.user_preferences
   SET trial_ended_email_sent_at = now()
 WHERE subscription_status = 'expired'
   AND trial_ended_email_sent_at IS NULL;

-- 3) Denný beh – po expire_trials (03:15), digeste (07:45) aj pripomienkach (08:00).
SELECT cron.unschedule('send-trial-ending-daily')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-trial-ending-daily');

SELECT cron.schedule(
  'send-trial-ending-daily',
  '15 8 * * *',
  $$
  select net.http_post(
    url:='https://tmssxnluhjhzqmutflbl.supabase.co/functions/v1/send-trial-ending',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtc3N4bmx1aGpoenFtdXRmbGJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNzQ2MzcsImV4cCI6MjA5ODg1MDYzN30.-pl_XY06sOShITzwFJkYZcmHcfDaJFI_x9J3nxXVbiY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
