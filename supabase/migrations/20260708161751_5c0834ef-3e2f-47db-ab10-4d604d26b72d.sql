
-- 1) Add columns
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'trial';

-- 2) Backfill existing rows: give everyone 2 months from today
UPDATE public.user_preferences
   SET trial_started_at = now()
 WHERE trial_started_at IS NULL;

-- 3) Enforce default + not null + allowed values going forward
ALTER TABLE public.user_preferences
  ALTER COLUMN trial_started_at SET DEFAULT now(),
  ALTER COLUMN trial_started_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_preferences_subscription_status_check'
  ) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_subscription_status_check
      CHECK (subscription_status IN ('trial','active','expired'));
  END IF;
END $$;

-- 4) Daily expiry job (runs as SQL only — no external endpoint needed)
CREATE OR REPLACE FUNCTION public.expire_trials()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH upd AS (
    UPDATE public.user_preferences
       SET subscription_status = 'expired',
           updated_at = now()
     WHERE subscription_status = 'trial'
       AND trial_started_at < now() - interval '60 days'
     RETURNING 1
  )
  SELECT COALESCE(count(*), 0)::int FROM upd;
$$;

-- Schedule (or replace) the daily cron
DO $$
BEGIN
  PERFORM cron.unschedule('expire-trials-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'expire-trials-daily',
  '15 3 * * *',
  $$ SELECT public.expire_trials(); $$
);
